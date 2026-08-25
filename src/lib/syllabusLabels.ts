// Code -> human label for every subtopic across all 9709 modules.
// Mirrors the syllabus blocks in supabase/functions/suggest-question-metadata/index.ts.
// Used to render readable tags from AI suggestions (which return codes only).

export const SUBTOPIC_LABELS: Record<string, string> = {
  // ===== P1 =====
  "1.1.1": "Completing the square",
  "1.1.2": "Discriminant",
  "1.1.3": "Solving quadratic equations and inequalities",
  "1.1.4": "Simultaneous equations (one linear, one quadratic)",
  "1.1.5": "Equations quadratic in a function of x",
  "1.2.1": "Function terminology (domain, range, one-one, inverse, composition)",
  "1.2.2": "Range of a function and composite functions",
  "1.2.3": "Inverse functions",
  "1.2.4": "Graphical relationship between function and inverse",
  "1.2.5": "Graph transformations (translations, reflections, stretches)",
  "1.3.1": "Equation of a straight line",
  "1.3.2": "Distance, gradient, midpoint, parallel and perpendicular lines",
  "1.3.3": "Equation of a circle",
  "1.3.4": "Problems involving lines and circles",
  "1.3.5": "Intersection of graphs and solutions of equations",
  "1.4.1": "Radians and degrees",
  "1.4.2": "Arc length and sector area",
  "1.5.1": "Graphs of sin, cos and tan",
  "1.5.2": "Exact values for standard angles (30, 45, 60 degrees)",
  "1.5.3": "Inverse trigonometric notation",
  "1.5.4": "Trigonometric identities (sin^2+cos^2=1, tan=sin/cos)",
  "1.5.5": "Solving trigonometric equations in a given interval",
  "1.6.1": "Binomial expansion (positive integer n)",
  "1.6.2": "Recognising APs and GPs",
  "1.6.3": "nth term and sum formulas for APs and GPs",
  "1.6.4": "Convergence and sum to infinity of a GP",
  "1.7.1": "Gradient of a curve and derivative notation",
  "1.7.2": "Differentiation of x^n and chain rule",
  "1.7.3": "Tangents, normals, increasing/decreasing functions and rates of change",
  "1.7.4": "Stationary points (locate, classify, use in sketching)",
  "1.8.1": "Integration as reverse of differentiation; integrate power functions",
  "1.8.2": "Constant of integration",
  "1.8.3": "Definite integrals",
  "1.8.4": "Area bounded by curves and lines",
  "1.8.5": "Volume of revolution",

  // ===== P2 =====
  "2.1.1": "Modulus — graph of y=|ax+b|, equations and inequalities",
  "2.1.2": "Polynomial division (quotient and remainder)",
  "2.1.3": "Factor theorem and remainder theorem",
  "2.2.1": "Laws of logarithms",
  "2.2.2": "Properties and graphs of e^x and ln x",
  "2.2.3": "Solving equations and inequalities with unknown in index",
  "2.2.4": "Logarithmic transformation to linear form",
  "2.3.1": "Secant, cosecant and cotangent — properties and graphs",
  "2.3.2": "Trigonometric identities — Pythagorean, compound angle, double angle, R form",
  "2.4.1": "Derivatives of e^x, ln x, sin x, cos x, tan x and composites",
  "2.4.2": "Product rule and quotient rule",
  "2.4.3": "Parametric and implicit differentiation",
  "2.5.1": "Standard integrals — e^(ax+b), 1/(ax+b), sin/cos/sec^2(ax+b)",
  "2.5.2": "Integration using trigonometric identities",
  "2.5.3": "Trapezium rule (estimate definite integral)",
  "2.6.1": "Locating roots by sign change and graphical methods",
  "2.6.2": "Iterative sequences converging to a root",

  // ===== P3 =====
  "3.1.1": "Modulus — graph of y=|ax+b|, equations and inequalities",
  "3.1.2": "Polynomial division (quotient and remainder)",
  "3.1.3": "Factor theorem and remainder theorem",
  "3.1.4": "Partial fractions",
  "3.1.5": "Binomial expansion for rational n (including validity)",
  "3.2.1": "Laws of logarithms",
  "3.2.2": "Properties and graphs of e^x and ln x",
  "3.2.3": "Solving equations and inequalities with unknown in index",
  "3.2.4": "Logarithmic transformation to linear form",
  "3.3.1": "Secant, cosecant and cotangent — properties and graphs",
  "3.3.2": "Trigonometric identities — Pythagorean, compound angle, double angle, R form",
  "3.4.1": "Derivatives of e^x, ln x, sin x, cos x, tan x, tan^(-1) x and composites",
  "3.4.2": "Product rule and quotient rule",
  "3.4.3": "Parametric and implicit differentiation",
  "3.5.1": "Standard integrals — e^(ax+b), 1/(ax+b), sin/cos/sec^2(ax+b), 1/(x^2+a^2)",
  "3.5.2": "Integration using trigonometric identities",
  "3.5.3": "Integration by partial fractions",
  "3.5.4": "Integration of f'(x)/f(x) type",
  "3.5.5": "Integration by parts",
  "3.5.6": "Integration by substitution",
  "3.6.1": "Locating roots by sign change and graphical methods",
  "3.6.2": "Iterative sequences converging to a root",
  "3.7.1": "Vector notation and basic operations",
  "3.7.2": "Magnitude, unit vectors, displacement and position vectors",
  "3.7.3": "Equation of a straight line in vector form r = a + tb",
  "3.7.4": "Parallel, intersecting and skew lines",
  "3.7.5": "Scalar product and applications",
  "3.8.1": "Formulating differential equations from rates of change",
  "3.8.2": "Solving separable differential equations",
  "3.8.3": "Particular solutions using initial conditions",
  "3.8.4": "Interpreting solutions in context",
  "3.9.1": "Terminology — real part, imaginary part, modulus, argument, conjugate",
  "3.9.2": "Arithmetic in Cartesian form",
  "3.9.3": "Conjugate pairs and polynomial roots",
  "3.9.4": "Argand diagram",
  "3.9.5": "Polar form and multiplication/division",
  "3.9.6": "Square roots of a complex number",
  "3.9.7": "Geometrical effects of complex number operations",
  "3.9.8": "Loci in the Argand diagram",

  // ===== M1 =====
  "4.1.1": "Identifying forces in a given situation",
  "4.1.2": "Components and resultants of forces",
  "4.1.3": "Equilibrium of a particle",
  "4.1.4": "Normal contact force and frictional force",
  "4.1.5": "Smooth contact model",
  "4.1.6": "Limiting friction and coefficient of friction",
  "4.1.7": "Newton's third law",
  "4.2.1": "Distance, speed, displacement, velocity and acceleration",
  "4.2.2": "Displacement-time and velocity-time graphs",
  "4.2.3": "Calculus methods for displacement, velocity and acceleration",
  "4.2.4": "Constant acceleration formulae (suvat)",
  "4.3.1": "Linear momentum",
  "4.3.2": "Conservation of linear momentum and direct impact",
  "4.4.1": "Applying Newton's second law (F = ma) to a particle",
  "4.4.2": "Mass and weight (W = mg)",
  "4.4.3": "Motion on an inclined plane",
  "4.4.4": "Connected particles",
  "4.5.1": "Work done by a force",
  "4.5.2": "Gravitational potential energy and kinetic energy",
  "4.5.3": "Work-energy principle and conservation of energy",
  "4.5.4": "Power (P = Fv)",

  // ===== S1 =====
  "5.1.1": "Selecting and critiquing statistical representations",
  "5.1.2": "Stem-and-leaf, box-and-whisker, histograms, cumulative frequency graphs",
  "5.1.3": "Measures of central tendency and variation",
  "5.1.4": "Using cumulative frequency graphs to estimate statistics",
  "5.1.5": "Calculating mean and standard deviation from data or coded totals",
  "5.2.1": "Permutations and combinations — selections",
  "5.2.2": "Arrangements in a line including repetition and restriction",
  "5.3.1": "Calculating basic probabilities by enumeration or counting",
  "5.3.2": "Addition and multiplication of probabilities",
  "5.3.3": "Mutually exclusive and independent events",
  "5.3.4": "Conditional probability",
  "5.4.1": "Probability distribution tables, E(X) and Var(X)",
  "5.4.2": "Binomial and geometric distributions — B(n,p) and Geo(p)",
  "5.4.3": "Expectation and variance of binomial and geometric distributions",
  "5.5.1": "Normal distribution model and tables — finding probabilities",
  "5.5.2": "Finding unknown mean or standard deviation using normal distribution",
  "5.5.3": "Normal approximation to the binomial distribution with continuity correction",

  // ===== S2 =====
  "6.1.1": "Calculating Poisson probabilities",
  "6.1.2": "Mean and variance of Poisson",
  "6.1.3": "Poisson distribution as a model for random events",
  "6.1.4": "Poisson approximation to the binomial",
  "6.1.5": "Normal approximation to the Poisson with continuity correction",
  "6.2.1": "E(aX + b) and Var(aX + b)",
  "6.2.2": "E(aX + bY) and Var(aX + bY) for independent variables",
  "6.2.3": "Linear combinations of normal and Poisson distributions",
  "6.3.1": "Probability density functions — properties and probabilities",
  "6.3.2": "Mean, variance and percentiles from a pdf",
  "6.4.1": "Samples, populations and random sampling",
  "6.4.2": "Sample mean as a random variable",
  "6.4.3": "Central Limit Theorem",
  "6.4.4": "Unbiased estimates of population mean and variance",
  "6.4.5": "Confidence intervals for a population mean",
  "6.4.6": "Confidence interval for a population proportion",
  "6.5.1": "Hypothesis test terminology",
  "6.5.2": "Hypothesis tests for binomial and Poisson distributions",
  "6.5.3": "Hypothesis tests for a population mean (z-test)",
  "6.5.4": "Type I and Type II errors",
};

/**
 * Human-readable subtopic text for storage, search and grouping — e.g.
 * "4.1.2 Components and resultants of forces, 4.1.3 Equilibrium of a particle".
 * Returns null when there is nothing to describe so callers can fall back to
 * the legacy free-text `subtopics` column.
 */
export function subtopicCodesToText(codes: string[] | null | undefined): string | null {
  if (!codes || codes.length === 0) return null;
  const text = codes
    .map((c) => (typeof c === "string" ? c.trim() : ""))
    .filter(Boolean)
    .map((c) => {
      const label = SUBTOPIC_LABELS[c];
      return label ? `${c} ${label}` : c;
    })
    .join(", ");
  return text || null;
}

/**
 * The subtopic text to show for a question. The AI tagger writes syllabus
 * codes to `subtopic_ids`; questions imported before that column existed only
 * have the free-text `subtopics`. Prefer the codes, fall back to the text.
 */
export function resolveSubtopicText(
  subtopicIds: string[] | null | undefined,
  legacySubtopics: string | null | undefined,
): string {
  return subtopicCodesToText(subtopicIds) ?? (legacySubtopics ?? "").trim();
}

export function formatSubtopicCodes(codes: string[] | null | undefined): string {
  return subtopicCodesToText(codes) ?? "—";
}