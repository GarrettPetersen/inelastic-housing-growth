export interface ModelParams {
  popGrowthRate: number;
  techGrowthRate: number;
  housingGrowthRate: number;
  inequality: number; // sigma
  beta: number; // discount factor
  initialTech: number; // A_0
  initialPop: number; // N_0
  initialHousing: number; // H_0
}

export interface GenerationResult {
  name: string;
  time: number;
  ownershipRate: number;
  priceToIncome: number;
  avgLifetimeUtility: number;
  avgUtilityOwners: number;
  avgUtilityRenters: number;
  utilityP25: number;
  utilityMedian: number;
  utilityP75: number;
  avgConsumptionYoung: number;
  avgConsumptionOld: number;
  housePrice: number;
  population: number;
  housingStock: number;
  incomeMean: number;
}

// Standard Normal Inverse CDF (Probit function)
// Beasley-Springer-Moro algorithm approximation
function probit(p: number): number {
  if (p <= 0 || p >= 1) return 0;
  const a1 = -3.969683028665376e+01;
  const a2 = 2.209460984245205e+02;
  const a3 = -2.759285104469687e+02;
  const a4 = 1.383577518672690e+02;
  const a5 = -3.066479806614716e+01;
  const a6 = 2.506628277459239e+00;

  const b1 = -5.447609879822406e+01;
  const b2 = 1.615858368580409e+02;
  const b3 = -1.556989798598866e+02;
  const b4 = 6.680131188771972e+01;
  const b5 = -1.328068155288572e+01;

  const c1 = -7.784894002430293e-03;
  const c2 = -3.223964580411365e-01;
  const c3 = -2.400758277161838e+00;
  const c4 = -2.549732539343734e+00;
  const c5 = 4.374664141464968e+00;
  const c6 = 2.938163982698783e+00;

  const d1 = 7.784695709041462e-03;
  const d2 = 3.224671290700398e-01;
  const d3 = 2.445134137142996e+00;
  const d4 = 3.754408661907416e+00;

  const p_low = 0.02425;
  const p_high = 1 - p_low;

  let q: number, r: number;

  if (p < p_low) {
    q = Math.sqrt(-2 * Math.log(p));
    return (((((c1 * q + c2) * q + c3) * q + c4) * q + c5) * q + c6) /
      ((((d1 * q + d2) * q + d3) * q + d4) * q + 1);
  } else if (p <= p_high) {
    q = p - 0.5;
    r = q * q;
    return (((((a1 * r + a2) * r + a3) * r + a4) * r + a5) * r + a6) * q /
      (((((b1 * r + b2) * r + b3) * r + b4) * r + b5) * r + 1);
  } else {
    q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c1 * q + c2) * q + c3) * q + c4) * q + c5) * q + c6) /
      ((((d1 * q + d2) * q + d3) * q + d4) * q + 1);
  }
}

const SIMULATION_STEPS = 10; // Look ahead 10 generations
const AGENTS_COUNT = 1000; // Number of agents to simulate distribution
const ALPHA = 1; // Utility value of living in a house

export function simulate(params: ModelParams): GenerationResult[] {
  // 1. Pre-calculate distributions
  // We use a deterministic set of quantiles for stability
  const productivities: number[] = [];
  for (let i = 0; i < AGENTS_COUNT; i++) {
    const p = (i + 0.5) / AGENTS_COUNT;
    const z = probit(p);
    // ln(a_i) ~ Normal(0, sigma^2) -> a_i = exp(0 + sigma * z)
    productivities.push(Math.exp(params.inequality * z));
  }
  // Normalize mean to 1 (optional, but keeps A_t interpretable as mean income)
  // Actually the prompt says "normalize mu=0", so mean is exp(sigma^2/2). 
  // Let's stick to prompt: ln(a_i) ~ N(0, sigma^2).

  // 2. Initialize variables
  let prices: number[] = new Array(SIMULATION_STEPS).fill(0);
  
  // Initial guess for prices: simple growth model
  // Ideally P grows with Income/Pop ratio? 
  // Start with P = 1 for all, loop will correct it.
  for(let i=0; i<SIMULATION_STEPS; i++) prices[i] = params.initialTech * params.initialPop * 0.1; // heuristic start

  // 3. Iterate to find equilibrium prices
  const MAX_ITER = 20;
  for (let iter = 0; iter < MAX_ITER; iter++) {
    let maxDiff = 0;
    const newPrices = [...prices];

    // We solve backwards or iteratively?
    // Iteratively is easier to reason about here because of the dependencies.
    // But WTP at t depends on P_{t+1}. 
    // The last period SIMULATION_STEPS-1 needs a terminal condition.
    // Assume P_{T} = P_{T-1} * (1 + techGrowth) * (1 + popGrowth) / (1 + housingGrowth) approximately?
    // Or just fix P_T based on previous iteration's trend.
    
    // Let's update P_t based on demand given P_{t+1}.
    // We need to do this for t = 0 to T-2.
    // For T-1, we need an assumption for T.
    
    // Terminal condition update
    const lastT = SIMULATION_STEPS - 1;
    newPrices[lastT] = prices[lastT - 1] * (1 + params.techGrowthRate); // Simple extrapolation

    for (let t = 0; t < SIMULATION_STEPS - 1; t++) {
      const N_t = params.initialPop * Math.pow(1 + params.popGrowthRate, t);
      const H_t = params.initialHousing * Math.pow(1 + params.housingGrowthRate, t);
      const A_t = params.initialTech * Math.pow(1 + params.techGrowthRate, t);
      
      const P_next = prices[t+1];
      
      // Calculate WTP for each agent
      const wtps: number[] = [];
      
      // Optimization: We only need to find the H_t-th highest WTP.
      // If H_t >= N_t, price is 0 (or min construction cost? Prompt implies fixed stock).
      // If H_t >= N_t, everyone gets a house, P_t = 0 (since it's an auction and supply > demand).
      // Actually, with alpha > 0, even if supply > demand, people might pay positive amount if it allows wealth transfer?
      // But strictly in second price auction with supply S and demand D, if S >= D, price is the (S+1)th bid.
      // Here everyone wants a house if utility gain > cost.
      // Since alpha=1 > 0, everyone prefers house if free.
      // So if H_t >= N_t, price is determined by the marginal buyer (or 0 if supply exceeds total population).
      // Prompt: "The top H_t households become homeowners... The market price P_t is equal to the H_t-th highest WTP"
      // Wait, usually it's the (H_t + 1)-th bid (Vickrey)?
      // "market price P_t is equal to the H_t-th highest WTP (second-price logic)."
      // Okay, we will follow the prompt: H_t-th highest.
      
      // If H_t >= AGENTS_COUNT (scaled), price is 0?
      // Note: We simulate `AGENTS_COUNT` representative agents.
      // Scale factor = N_t / AGENTS_COUNT.
      // Number of houses available to these agents = H_t / (N_t / AGENTS_COUNT) = AGENTS_COUNT * (H_t/N_t).
      // Let effective_H = floor(AGENTS_COUNT * (H_t / N_t)).
      // Since H_0 = N_0, and growth rates differ, H/N changes.
      
      const supplyRatio = Math.min(1.0, H_t / N_t);
      const housesAvailable = Math.floor(supplyRatio * AGENTS_COUNT);
      
      if (housesAvailable >= AGENTS_COUNT) {
         // Everyone buys. Price is the lowest WTP? Or 0?
         // If supply = demand, price is the lowest bidder's WTP?
         // Prompt says "market price P_t is equal to the H_t-th highest WTP".
         // If H_t = N_t, that is the N_t-th highest (i.e. the lowest) WTP.
      }
      
      for (let i = 0; i < AGENTS_COUNT; i++) {
        const y = A_t * productivities[i];
        
        // Solve for WTP: Price P such that U(own, P) = U(rent)
        // U(rent) = log(y - s_rent) + beta * log(s_rent)
        // s_rent* = beta * y / (1 + beta)
        // c_young_rent = y / (1 + beta)
        // c_old_rent = beta * y / (1 + beta)
        // U(rent) = log(y/(1+b)) + b*log(by/(1+b))
        //         = (1+b)log(y) + log(1/(1+b)) + b*log(b/(1+b))
        //         = (1+b)log(y) + constant_rent
        
        const s_rent = (params.beta * y) / (1 + params.beta);
        const u_rent = Math.log(y - s_rent) + params.beta * Math.log(s_rent);
        
        // U(own, P) = log(y - P - s_own) + beta * log(s_own + P_next) + alpha
        // We need to find P such that U(own, P) == u_rent.
        // This is a non-linear equation in P.
        // However, we can observe that WTP is likely bounded by y.
        // Function f(P) = U(own, P) - u_rent. We want root.
        // f(P) is decreasing in P.
        
        // Use binary search for P in [0, y].
        // Max P is y (can't consume negative).
        
        // Optimization: Can we solve analytically?
        // No simple analytic solution for P due to logs and s_own optimization inside.
        // Binary search is robust.
        
        let low = 0;
        let high = y; // Can't pay more than income
        let wtp = 0;
        
        // Optimization: check if P=0 gives U(own) > U(rent). It should (alpha=1).
        // Check if P=y gives U(own) < U(rent). Yes (-inf).
        
        for(let b=0; b<15; b++) { // 15 iterations is enough for precision
           const P_guess = (low + high) / 2;
           
           // Solve optimal savings for this P_guess
           // s_own maximizes log(y - P_guess - s) + beta * log(s + P_next)
           // FOC derived earlier: s(1+beta) = beta(y - P_guess) - P_next
           let s_own = (params.beta * (y - P_guess) - P_next) / (1 + params.beta);
           if (s_own < 0) s_own = 0;
           
           // Check constraints
           if (y - P_guess - s_own <= 0) {
             // Too expensive, consumption zero or neg
             high = P_guess;
             continue;
           }
           
           const u_own = Math.log(y - P_guess - s_own) + params.beta * Math.log(s_own + P_next) + ALPHA;
           
           if (u_own > u_rent) {
             low = P_guess;
             wtp = P_guess;
           } else {
             high = P_guess;
           }
        }
        wtps.push(wtp);
      }
      
      // Sort WTPs descending
      wtps.sort((a, b) => b - a);
      
      // Determine price
      let newPrice = 0;
      if (housesAvailable > 0) {
          // H_t-th highest. Index is housesAvailable - 1
          // But if housesAvailable == AGENTS_COUNT, we take the last one.
          let priceIndex = housesAvailable - 1;
          if (priceIndex >= wtps.length) priceIndex = wtps.length - 1;
          newPrice = wtps[priceIndex];
      }
      
      // Damping to avoid oscillations
      newPrices[t] = 0.5 * prices[t] + 0.5 * newPrice;
      maxDiff = Math.max(maxDiff, Math.abs(newPrices[t] - prices[t]));
    }
    
    prices = newPrices;
    if (maxDiff < 0.01) break; // Convergence
  }
  
  // 4. Compute final results for the requested generations
  const results: GenerationResult[] = [];
  const generations = ["Boomers", "Millennials", "Gen Alpha"];
  
  for (let t = 0; t < 3; t++) {
      const N_t = params.initialPop * Math.pow(1 + params.popGrowthRate, t);
      const H_t = params.initialHousing * Math.pow(1 + params.housingGrowthRate, t);
      const A_t = params.initialTech * Math.pow(1 + params.techGrowthRate, t);
      const P_t = prices[t];
      const P_next = prices[t+1];
      
      // Re-run allocation for the equilibrium price
      let totalUtility = 0;
      let totalUtilityOwners = 0;
      let totalUtilityRenters = 0;
      let totalConsYoung = 0;
      let totalConsOld = 0;
      let ownerCount = 0;
      let incomeSum = 0;
      const agentUtilities: number[] = [];
      
      // Better approach for stats: Re-calculate WTPs, sort, identify owners, then compute stats.
      const agents = [];
      for(let i=0; i<AGENTS_COUNT; i++) {
          const y = A_t * productivities[i];
          incomeSum += y;
          
          // Calculate WTP again (could be optimized to not redo)
          let low = 0;
          let high = y; 
          let wtp = 0;
          const s_rent = (params.beta * y) / (1 + params.beta);
          const u_rent = Math.log(y - s_rent) + params.beta * Math.log(s_rent);

          for(let b=0; b<15; b++) {
             const P_guess = (low + high) / 2;
             let s_own = (params.beta * (y - P_guess) - P_next) / (1 + params.beta);
             if (s_own < 0) s_own = 0;
             if (y - P_guess - s_own <= 0) { high = P_guess; continue; }
             const u_own = Math.log(y - P_guess - s_own) + params.beta * Math.log(s_own + P_next) + ALPHA;
             if (u_own > u_rent) { low = P_guess; wtp = P_guess; } else { high = P_guess; }
          }
          agents.push({ i, y, wtp, u_rent });
      }
      
      agents.sort((a, b) => b.wtp - a.wtp);
      
      const supplyRatio = Math.min(1.0, H_t / N_t);
      const numOwners = Math.floor(supplyRatio * AGENTS_COUNT);
      
      for(let i=0; i<AGENTS_COUNT; i++) {
          const agent = agents[i];
          const isOwner = i < numOwners;
          
          let c_young, c_old, u;
          if (isOwner) {
              let s = (params.beta * (agent.y - P_t) - P_next) / (1 + params.beta);
              if (s < 0) s = 0;
              c_young = agent.y - P_t - s;
              c_old = s + P_next;
              u = Math.log(c_young) + params.beta * Math.log(c_old) + ALPHA;
              totalUtilityOwners += u;
              ownerCount++;
          } else {
              let s = (params.beta * agent.y) / (1 + params.beta);
              c_young = agent.y - s;
              c_old = s; // No house to sell
              u = agent.u_rent;
              totalUtilityRenters += u;
          }
          
          totalUtility += u;
          agentUtilities.push(u);
          totalConsYoung += c_young;
          totalConsOld += c_old;
      }
      
      // Sort utilities to find percentiles
      // Note: agents array is sorted by WTP, not necessarily by utility, 
      // though they are correlated. We need to sort the utilities explicitly.
      agentUtilities.sort((a, b) => a - b);
      const p25Index = Math.floor(0.25 * AGENTS_COUNT);
      const p50Index = Math.floor(0.50 * AGENTS_COUNT);
      const p75Index = Math.floor(0.75 * AGENTS_COUNT);
      
      results.push({
          name: generations[t],
          time: t,
          ownershipRate: ownerCount / AGENTS_COUNT,
          priceToIncome: P_t / (incomeSum / AGENTS_COUNT),
          avgLifetimeUtility: totalUtility / AGENTS_COUNT,
          avgUtilityOwners: ownerCount > 0 ? totalUtilityOwners / ownerCount : NaN,
          avgUtilityRenters: (AGENTS_COUNT - ownerCount) > 0 ? totalUtilityRenters / (AGENTS_COUNT - ownerCount) : NaN,
          utilityP25: agentUtilities[p25Index],
          utilityMedian: agentUtilities[p50Index],
          utilityP75: agentUtilities[p75Index],
          avgConsumptionYoung: totalConsYoung / AGENTS_COUNT,
          avgConsumptionOld: totalConsOld / AGENTS_COUNT,
          housePrice: P_t,
          population: N_t,
          housingStock: H_t,
          incomeMean: incomeSum / AGENTS_COUNT
      });
  }
  
  return results;
}

