import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { logger } from "@/lib/logger";

interface UserRow {
  user_id: string;
  email: string;
  full_name: string | null;
  balance: number;
  multiplier: number;
  roles: string[];
}

export const UsersCreditsPanel = () => {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [grantAmount, setGrantAmount] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const [{ data: profiles }, { data: credits }, { data: roles }] = await Promise.all([
        supabase.from("profiles").select("user_id, email, full_name, credit_multiplier" as any).limit(200),
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

  const filtered = users.filter((u) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (u.email ?? "").toLowerCase().includes(q) || (u.full_name ?? "").toLowerCase().includes(q);
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Users & Credits</CardTitle>
        <CardDescription>
          Grant credits manually, or toggle VIP status (VIPs burn 0.2 credits per AI action instead of 1).
          Admins bypass credits entirely.
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
                <TableHead>User</TableHead>
                <TableHead>Roles</TableHead>
                <TableHead>Balance</TableHead>
                <TableHead>Rate</TableHead>
                <TableHead>Grant credits</TableHead>
                <TableHead>VIP</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((u) => {
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
                      {isAdmin ? "bypass" : `${u.multiplier}× / action`}
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