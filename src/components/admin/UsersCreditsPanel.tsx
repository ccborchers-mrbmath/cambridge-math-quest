import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ColumnFilter, MISSING } from "@/components/admin/ColumnFilter";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { logger } from "@/lib/logger";

interface UserRow {
  user_id: string;
  email: string;
  full_name: string | null;
  balance: number;
  multiplier: number;
  roles: string[];
  billingExempt: boolean;
}

type SortKey = "name" | "balance" | "rate" | "billed";
type SortDir = "asc" | "desc";

export const UsersCreditsPanel = () => {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [grantAmount, setGrantAmount] = useState<Record<string, string>>({});
  const [rateInput, setRateInput] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<Set<string>>(new Set());
  const [billedFilter, setBilledFilter] = useState<Set<string>>(new Set());
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const load = async () => {
    setLoading(true);
    try {
      const [{ data: profiles }, { data: credits }, { data: roles }] = await Promise.all([
        supabase.from("profiles").select("user_id, email, full_name, credit_multiplier, billing_exempt" as any).limit(200),
        (supabase as any).from("user_credits").select("user_id, balance"),
        supabase.from("user_roles").select("user_id, role"),
      ]);

      const creditMap = new Map<string, number>((credits ?? []).map((c: any) => [c.user_id, Number(c.balance)]));
      const roleMap = new Map<string, string[]>();
      (roles ?? []).forEach((r: any) => {
        const list = roleMap.get(r.user_id) ?? [];
        list.push(r.role);
        roleMap.set(r.user_id, list);
      });

      const rows: UserRow[] = (profiles ?? []).map((p: any) => ({
        user_id: p.user_id,
        email: p.email,
        full_name: p.full_name,
        balance: creditMap.get(p.user_id) ?? 0,
        multiplier: Number(p.credit_multiplier ?? 1),
        roles: roleMap.get(p.user_id) ?? [],
        billingExempt: Boolean(p.billing_exempt),
      }));
      setUsers(rows);
    } catch (e) {
      logger.error("Failed to load users", e);
      toast.error("Failed to load users");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const grant = async (userId: string) => {
    const raw = grantAmount[userId];
    const amount = Number(raw);
    if (!raw || Number.isNaN(amount) || amount <= 0) {
      toast.error("Enter a positive credit amount");
      return;
    }
    const { error } = await (supabase as any).rpc("grant_credits", {
      _user_id: userId,
      _amount: amount,
      _reason: "admin_grant",
      _metadata: {},
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`Granted ${amount} credits`);
    setGrantAmount((s) => ({ ...s, [userId]: "" }));
    void load();
  };

  const toggleVip = async (userId: string, makeVip: boolean) => {
    const { error } = await (supabase as any).rpc("set_vip_status", {
      _user_id: userId,
      _is_vip: makeVip,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(makeVip ? "User is now VIP (0.2× credit rate)" : "VIP status removed");
    void load();
  };

  const setRate = async (userId: string) => {
    const raw = rateInput[userId];
    const multiplier = Number(raw);
    if (!raw || Number.isNaN(multiplier) || multiplier < 0) {
      toast.error("Enter a rate of 0 or higher");
      return;
    }
    const { error } = await (supabase as any).rpc("set_credit_multiplier", {
      _user_id: userId,
      _multiplier: multiplier,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`Rate set to ${multiplier}× per action`);
    setRateInput((s) => ({ ...s, [userId]: "" }));
    void load();
  };

  const toggleBilling = async (userId: string, exempt: boolean) => {
    const { error } = await (supabase as any).rpc("set_billing_exempt", {
      _user_id: userId,
      _exempt: exempt,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(exempt ? "User no longer billed for credit usage" : "User is billed for credit usage again");
    void load();
  };

  const roleOptions = useMemo(() => {
    const seen = new Set<string>();
    users.forEach((u) => u.roles.forEach((r) => seen.add(r)));
    const opts = Array.from(seen).sort().map((r) => ({ value: r, label: r }));
    if (users.some((u) => u.roles.length === 0)) opts.unshift({ value: MISSING, label: "(No roles)" });
    return opts;
  }, [users]);

  const billedOptions = useMemo(
    () => [
      { value: "billed", label: "Billed" },
      { value: "exempt", label: "Not billed" },
    ],
    [],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((u) => {
      if (q && !(u.email ?? "").toLowerCase().includes(q) && !(u.full_name ?? "").toLowerCase().includes(q)) {
        return false;
      }
      if (roleFilter.size > 0) {
        if (u.roles.length === 0) {
          if (!roleFilter.has(MISSING)) return false;
        } else if (!u.roles.some((r) => roleFilter.has(r))) {
          return false;
        }
      }
      if (billedFilter.size > 0) {
        const key = u.billingExempt ? "exempt" : "billed";
        if (!billedFilter.has(key)) return false;
      }
      return true;
    });
  }, [users, search, roleFilter, billedFilter]);

  const sorted = useMemo(() => {
    const rows = [...filtered];
    const dir = sortDir === "asc" ? 1 : -1;
    rows.sort((a, b) => {
      switch (sortKey) {
        case "balance":
          return (a.balance - b.balance) * dir;
        case "rate":
          return (a.multiplier - b.multiplier) * dir;
        case "billed":
          return (Number(a.billingExempt) - Number(b.billingExempt)) * dir;
        case "name":
        default: {
          const an = (a.full_name ?? a.email ?? "").toLowerCase();
          const bn = (b.full_name ?? b.email ?? "").toLowerCase();
          return an.localeCompare(bn) * dir;
        }
      }
    });
    return rows;
  }, [filtered, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const SortIcon = ({ column }: { column: SortKey }) => {
    if (sortKey !== column) return <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" />;
    return sortDir === "asc" ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />;
  };

  const SortableHead = ({ column, children }: { column: SortKey; children: React.ReactNode }) => (
    <TableHead>
      <button
        type="button"
        onClick={() => toggleSort(column)}
        className={cn(
          "inline-flex items-center gap-1 hover:text-foreground",
          sortKey === column ? "text-foreground" : "text-muted-foreground",
        )}
      >
        {children}
        <SortIcon column={column} />
      </button>
    </TableHead>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Users & Credits</CardTitle>
        <CardDescription>
          Grant credits manually, edit a user's per-action credit rate for custom pricing, toggle VIP status
          (0.2× shortcut), or exempt a user from billing entirely so their credits never get burned. Admins
          bypass credits regardless.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Input
          placeholder="Search by email or name"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <SortableHead column="name">User</SortableHead>
                <TableHead>
                  <ColumnFilter label="Roles" options={roleOptions} selected={roleFilter} onChange={setRoleFilter} />
                </TableHead>
                <SortableHead column="balance">Balance</SortableHead>
                <SortableHead column="rate">Rate</SortableHead>
                <TableHead>Grant credits</TableHead>
                <TableHead>VIP</TableHead>
                <SortableHead column="billed">
                  <ColumnFilter label="Billed" options={billedOptions} selected={billedFilter} onChange={setBilledFilter} />
                </SortableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((u) => {
                const isAdmin = u.roles.includes("admin");
                const isVip = u.roles.includes("vip");
                return (
                  <TableRow key={u.user_id}>
                    <TableCell>
                      <div className="font-medium">{u.full_name ?? "—"}</div>
                      <div className="text-xs text-muted-foreground">{u.email}</div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {u.roles.map((r) => (
                          <Badge key={r} variant={r === "admin" ? "default" : r === "vip" ? "secondary" : "outline"}>
                            {r}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>{u.balance.toFixed(2)}</TableCell>
                    <TableCell>
                      {isAdmin ? (
                        "bypass"
                      ) : (
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            min="0"
                            step="0.1"
                            className="w-20"
                            placeholder={`${u.multiplier}`}
                            value={rateInput[u.user_id] ?? ""}
                            onChange={(e) =>
                              setRateInput((s) => ({ ...s, [u.user_id]: e.target.value }))
                            }
                          />
                          <span className="text-xs text-muted-foreground">×</span>
                          <Button size="sm" variant="outline" onClick={() => setRate(u.user_id)}>
                            Save
                          </Button>
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Input
                          type="number"
                          min="1"
                          step="1"
                          placeholder="amount"
                          className="w-24"
                          value={grantAmount[u.user_id] ?? ""}
                          onChange={(e) =>
                            setGrantAmount((s) => ({ ...s, [u.user_id]: e.target.value }))
                          }
                        />
                        <Button size="sm" onClick={() => grant(u.user_id)}>Grant</Button>
                      </div>
                    </TableCell>
                    <TableCell>
                      {isAdmin ? (
                        <span className="text-xs text-muted-foreground">n/a</span>
                      ) : (
                        <Button
                          size="sm"
                          variant={isVip ? "secondary" : "outline"}
                          onClick={() => toggleVip(u.user_id, !isVip)}
                        >
                          {isVip ? "Remove VIP" : "Make VIP"}
                        </Button>
                      )}
                    </TableCell>
                    <TableCell>
                      {isAdmin ? (
                        <span className="text-xs text-muted-foreground">n/a</span>
                      ) : (
                        <div className="flex items-center gap-2">
                          <Badge variant={u.billingExempt ? "secondary" : "outline"}>
                            {u.billingExempt ? "Not billed" : "Billed"}
                          </Badge>
                          <Button
                            size="sm"
                            variant={u.billingExempt ? "secondary" : "outline"}
                            onClick={() => toggleBilling(u.user_id, !u.billingExempt)}
                          >
                            {u.billingExempt ? "Bill again" : "Exempt"}
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
};
