import { useState, useMemo } from 'react';
import { simulate } from './model';
import type { ModelParams, GenerationResult } from './model';
import { Users, Home, TrendingUp, Activity, DollarSign, RotateCcw, Info } from 'lucide-react';
import { ComposedChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';

const DEFAULT_PARAMS: ModelParams = {
  popGrowthRate: 0.25, // ~25% per generation
  techGrowthRate: 0.50, // ~50% per generation (~1.3% per year)
  housingGrowthRate: 0.05, // ~5% per generation (supply constraints)
  inequality: 0.4, // Log-income SD
  beta: 0.3, // Discount factor per generation (less speculative)
  initialTech: 2500000, // ~$2.5M lifetime -> ~$50k/yr
  initialPop: 10000,
  initialHousing: 10000
};

const Slider = ({
  label,
  value,
  onChange,
  min,
  max,
  step,
  format = (v: number) => v.toString(),
  tooltip
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  format?: (v: number) => string;
  tooltip?: string;
}) => (
  <div className="mb-4">
    <div className="flex justify-between mb-1 group relative">
      <label className="text-sm font-medium text-gray-700 flex items-center gap-1 cursor-help">
        {label}
        {tooltip && (
          <div className="relative">
            <Info className="w-3 h-3 text-gray-400" />
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-2 bg-gray-900 text-white text-xs rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
              {tooltip}
              <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900"></div>
            </div>
          </div>
        )}
      </label>
      <span className="text-sm text-gray-500">{format(value)}</span>
    </div>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(parseFloat(e.target.value))}
      className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
    />
  </div>
);

const IncomeDistributionChart = ({ result, globalMaxIncome, globalMaxCount }: { result: GenerationResult; globalMaxIncome: number; globalMaxCount: number }) => {
  // Process data for the chart
  // We want to show the distribution of income (density plot or histogram)
  // and a vertical line for the marginal buyer.

  const data = useMemo(() => {
    // Create buckets for histogram
    // We need to use the GLOBAL max income to align scales, but bucket based on local range?
    // No, if we want identical X scales, we must bucket from 0 to globalMaxIncome for ALL charts.
    const minInc = 0;
    const maxInc = globalMaxIncome;
    const bucketCount = 30;
    const bucketSize = (maxInc - minInc) / bucketCount;

    const buckets = new Array(bucketCount).fill(0).map((_, i) => ({
      binStart: minInc + i * bucketSize,
      binEnd: minInc + (i + 1) * bucketSize,
      count: 0,
      owners: 0,
      renters: 0
    }));

    result.incomeDistribution.forEach(d => {
      const val = d.income / 50;
      let bucketIdx = Math.floor((val - minInc) / bucketSize);
      if (bucketIdx >= bucketCount) bucketIdx = bucketCount - 1;
      if (bucketIdx < 0) bucketIdx = 0;

      buckets[bucketIdx].count++;
      if (d.buys) buckets[bucketIdx].owners++;
      else buckets[bucketIdx].renters++;
    });

    return buckets.map(b => ({
      name: `$${(b.binStart / 1000).toFixed(0)}k`,
      x: b.binStart,
      Owners: b.owners,
      Renters: b.renters,
      total: b.count
    }));
  }, [result, globalMaxIncome]);

  // Marginal buyer income approx (using result.ownershipRate to find quantile)
  // Actually, we can find the min income of owners?
  // In this model with iso-elastic utility, WTP is strictly increasing in Income.
  // So there is a clear income threshold.
  const minOwnerIncome = useMemo(() => {
    const owners = result.incomeDistribution.filter(d => d.buys).map(d => d.income / 50);
    return owners.length > 0 ? Math.min(...owners) : 0;
  }, [result]);

  return (
    <div className="mt-4 h-64 w-full">
      <h5 className="text-xs font-semibold text-gray-500 text-center mb-2">Income Distribution & Ownership</h5>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="x"
            tick={{ fontSize: 10 }}
            interval={4}
            tickFormatter={(val) => `$${(val / 1000).toFixed(0)}k`}
            domain={[0, 'auto']}
            type="number"
          />
          <YAxis domain={[0, globalMaxCount]} hide />
          <Tooltip
            labelFormatter={(val) => `$${(val / 1000).toFixed(0)}k`}
          />
          <Area type="step" dataKey="Owners" stackId="1" stroke="#2563eb" fill="#93c5fd" />
          <Area type="step" dataKey="Renters" stackId="1" stroke="#9ca3af" fill="#e5e7eb" />
          {result.ownershipRate > 0 && result.ownershipRate < 1 && (
            <ReferenceLine
              x={minOwnerIncome}
              stroke="red"
              strokeDasharray="3 3"
              label={{
                value: `Marginal Buyer: $${(minOwnerIncome / 1000).toFixed(1)}k`,
                position: 'insideTopLeft',
                fill: 'red',
                fontSize: 10
              }}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
};

const ResultCard = ({ result, globalMaxIncome, globalMaxCount }: { result: GenerationResult; globalMaxIncome: number; globalMaxCount: number }) => {
  const fmtUSD = (v: number) => {
    if (v >= 1000000) return `$${(v / 1000000).toFixed(2)}M`;
    if (v >= 1000) return `$${(v / 1000).toFixed(0)}k`;
    return `$${v.toFixed(0)}`;
  };

  const fmtAnn = (v: number) => fmtUSD(v / 50); // Annualized (approx 50 working years)

  return (
    <div className="bg-white rounded-xl shadow-md p-6 border border-gray-100 flex-1 min-w-[300px]">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xl font-bold text-gray-800">{result.name}</h3>
        <span className="text-xs font-mono bg-gray-100 px-2 py-1 rounded text-gray-500">t={result.time}</span>
      </div>

      <div className="space-y-4">
        {/* Housing Market Stats */}
        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col p-3 bg-blue-50 rounded-lg">
            <div className="flex items-center gap-1 text-xs text-gray-500 mb-1">
              <Home className="w-3 h-3" /> Ownership
            </div>
            <span className="text-lg font-bold text-blue-700">{(result.ownershipRate * 100).toFixed(1)}%</span>
          </div>
          <div className="flex flex-col p-3 bg-green-50 rounded-lg">
            <div className="flex items-center gap-1 text-xs text-gray-500 mb-1">
              <DollarSign className="w-3 h-3" /> Price/Inc
            </div>
            <span className="text-lg font-bold text-green-700">{result.priceToIncome.toFixed(1)}x</span>
          </div>
        </div>

        {/* Financials Table */}
        <div className="bg-gray-50 rounded-lg p-3">
          <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">Financials</h4>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">Buy Price (Young):</span>
              <span className="font-medium text-red-600">-{fmtUSD(result.housePrice)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Sell Price (Old):</span>
              <span className="font-medium text-green-600">+{fmtUSD(result.housePriceNext)}</span>
            </div>
            <div className="flex justify-between border-t border-gray-200 pt-1 mt-1">
              <span className="text-gray-600">Capital Gain:</span>
              <span className="font-medium text-blue-600">
                {((result.housePriceNext / result.housePrice - 1) * 100).toFixed(0)}%
              </span>
            </div>
            <div className="flex justify-between pt-2">
              <span className="text-gray-600">Avg Annual Inc:</span>
              <span className="font-medium">{fmtAnn(result.incomeMean)}</span>
            </div>
          </div>
        </div>

        {/* Income Distribution */}
        <div className="bg-gray-50 rounded-lg p-3">
          <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">Annual Income Dist.</h4>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">25th Percentile:</span>
              <span className="font-medium text-gray-700">{fmtAnn(result.incomeP25)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Median:</span>
              <span className="font-medium text-gray-700">{fmtAnn(result.incomeMedian)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">75th Percentile:</span>
              <span className="font-medium text-gray-700">{fmtAnn(result.incomeP75)}</span>
            </div>
          </div>
        </div>

        {/* Utility Stats */}
        <div className="p-3 bg-purple-50 rounded-lg">
          <div className="flex items-center gap-2 mb-2">
            <Activity className="w-4 h-4 text-purple-600" />
            <span className="text-sm font-medium text-purple-900">Utility (Happiness)</span>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Avg:</span>
              <span className="font-semibold text-purple-700">{result.avgLifetimeUtility.toFixed(1)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Med:</span>
              <span className="font-semibold text-purple-700">{result.utilityMedian.toFixed(1)}</span>
            </div>
            <div className="flex justify-between col-span-2 pt-1 mt-1 border-t border-purple-100">
              <span className="text-gray-500">Owners vs Renters:</span>
              <span className="font-semibold text-purple-700">
                {isNaN(result.avgUtilityOwners) ? '-' : result.avgUtilityOwners.toFixed(1)} / {isNaN(result.avgUtilityRenters) ? '-' : result.avgUtilityRenters.toFixed(1)}
              </span>
            </div>
          </div>
        </div>

        <IncomeDistributionChart result={result} globalMaxIncome={globalMaxIncome} globalMaxCount={globalMaxCount} />
      </div>
    </div>
  );
};

function App() {
  const [params, setParams] = useState<ModelParams>(DEFAULT_PARAMS);

  // Auto-fix state for hot-reloading dev cycles (migration)
  if (params.initialTech < 1000) {
    setParams(DEFAULT_PARAMS);
  }

  const results = useMemo(() => simulate(params), [params]);

  // Calculate global maximums for chart scaling
  const { globalMaxIncome, globalMaxCount } = useMemo(() => {
    let maxInc = 0;
    let maxCount = 0;

    results.forEach(res => {
      // Find max income in this generation
      res.incomeDistribution.forEach(d => {
        if (d.income / 50 > maxInc) maxInc = d.income / 50;
      });
    });

    // Let's do a quick binning pass for maxCount to ensure Y axis is consistent
    const bucketCount = 30;
    results.forEach(res => {
      const bucketSize = maxInc / bucketCount;
      const buckets = new Array(bucketCount).fill(0);
      res.incomeDistribution.forEach(d => {
        let idx = Math.floor((d.income / 50) / bucketSize);
        if (idx >= bucketCount) idx = bucketCount - 1;
        if (idx < 0) idx = 0;
        buckets[idx]++;
      });
      const localMax = Math.max(...buckets);
      if (localMax > maxCount) maxCount = localMax;
    });

    return { globalMaxIncome: maxInc, globalMaxCount: maxCount };
  }, [results]);

  const updateParam = (key: keyof ModelParams, value: number) => {
    setParams(prev => ({ ...prev, [key]: value }));
  };

  const resetParams = () => {
    setParams(DEFAULT_PARAMS);
  };

  const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 font-sans">
      <header className="bg-white border-b border-gray-200 py-6 px-8 mb-8">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-3xl font-bold tracking-tight text-gray-900 flex items-center gap-3">
            <img src="/house-dollar.svg" alt="Logo" className="w-10 h-10" />
            Inelastic Housing Growth Model
          </h1>
          <p className="mt-2 text-gray-600 max-w-3xl">
            An interactive OLG model simulating how housing supply constraints affect generational wealth and affordability.
            Explore how population, technology, and inequality impact Boomers (t=0), Millennials (t=1), and Gen Alpha (t=2).
          </p>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-12">
        <div className="flex flex-col lg:flex-row gap-8">
          {/* Controls Sidebar */}
          <div className="w-full lg:w-80 flex-shrink-0 space-y-8">
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <Users className="w-5 h-5" />
                  Demographics
                </h2>
                <button
                  onClick={resetParams}
                  className="text-xs flex items-center gap-1 text-gray-500 hover:text-blue-600 transition-colors"
                  title="Reset all parameters"
                >
                  <RotateCcw className="w-3 h-3" /> Reset
                </button>
              </div>
              <Slider
                label="Pop. Growth Rate"
                value={params.popGrowthRate}
                onChange={(v) => updateParam('popGrowthRate', v)}
                min={-0.2} max={1.0} step={0.01}
                format={pct}
                tooltip="Growth rate of the population per generation."
              />
              <Slider
                label="Initial Pop (N0)"
                value={params.initialPop}
                onChange={(v) => updateParam('initialPop', v)}
                min={1000} max={50000} step={1000}
                tooltip="Starting population size at t=0."
              />
            </div>

            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <TrendingUp className="w-5 h-5" />
                Economy
              </h2>
              <Slider
                label="Tech Growth Rate"
                value={params.techGrowthRate}
                onChange={(v) => updateParam('techGrowthRate', v)}
                min={0} max={2.0} step={0.01}
                format={pct}
                tooltip="Growth rate of productivity (wages) per generation."
              />
              <Slider
                label="Inequality (σ)"
                value={params.inequality}
                onChange={(v) => updateParam('inequality', v)}
                min={0.1} max={1.5} step={0.05}
                tooltip="Standard deviation of log-income. Higher means more gap between rich and poor."
              />
              <Slider
                label="Discount Factor (β)"
                value={params.beta}
                onChange={(v) => updateParam('beta', v)}
                min={0.1} max={0.99} step={0.01}
                tooltip="Patience. Higher beta means people care more about their old-age consumption."
              />
              <Slider
                label="Initial Tech (A0)"
                value={params.initialTech}
                onChange={(v) => updateParam('initialTech', v)}
                min={1000000} max={20000000} step={500000}
                format={(v) => `$${(v / 1000000).toFixed(1)}M`}
                tooltip="Starting productivity level (base lifetime income) at t=0."
              />
            </div>

            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Home className="w-5 h-5" />
                Housing Supply
              </h2>
              <Slider
                label="Housing Growth Rate"
                value={params.housingGrowthRate}
                onChange={(v) => updateParam('housingGrowthRate', v)}
                min={-0.1} max={1.0} step={0.01}
                format={pct}
                tooltip="Rate at which new housing stock is added per generation."
              />
              <Slider
                label="Initial Housing (H0)"
                value={params.initialHousing}
                onChange={(v) => updateParam('initialHousing', v)}
                min={1000} max={50000} step={1000}
                tooltip="Starting number of houses at t=0."
              />
            </div>
          </div>

          {/* Results Area */}
          <div className="flex-1">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {results.map((res) => (
                <ResultCard
                  key={res.time}
                  result={res}
                  globalMaxIncome={globalMaxIncome}
                  globalMaxCount={globalMaxCount}
                />
              ))}
            </div>

            <div className="mt-8 bg-white p-6 rounded-xl shadow-sm border border-gray-200">
              <h3 className="text-lg font-bold mb-4">Model Insights</h3>
              <div className="prose text-gray-600 text-sm space-y-4">
                <div>
                  <h4 className="font-semibold text-gray-800 mb-1">Utility & Consumption</h4>
                  <p>
                    Households live for two periods (Young, Old). They maximize lifetime utility:
                    <br />
                    <code>U = log(c_young) + β * log(c_old) + (Housing Utility)</code>
                    <br />
                    Households choose how much to save when young to smooth consumption into old age.
                    Buying a house is a form of saving: you pay now, but can sell it when old.
                  </p>
                </div>

                <div>
                  <h4 className="font-semibold text-gray-800 mb-1">Housing Market (Auction)</h4>
                  <p>
                    Housing supply is inelastic (fixed by the slider). Allocation follows a second-price auction:
                    everyone bids their maximum Willingness-To-Pay (WTP). The top <i>H<sub>t</sub></i> bidders win.
                    The market price is set by the marginal buyer (the last person to successfully buy a home).
                    <br />
                    <span className="text-xs text-gray-500 mt-1 block">
                      Note: If Supply &gt; Population, everyone buys, and the price is set by the poorest person's WTP (clearing the market at the lowest valuation).
                    </span>
                  </p>
                </div>

                <div>
                  <h4 className="font-semibold text-gray-800 mb-1">The Wealth Transfer Effect</h4>
                  <p>
                    When housing supply is constrained (Housing Growth &lt; Pop Growth), early generations ("Boomers") buy cheap.
                    As scarcity rises, prices skyrocket. This generates massive capital gains for the old (who sell to the young),
                    effectively transferring wealth from the working young to the asset-rich old.
                    The young are forced to spend a larger fraction of their income on housing, reducing their non-housing consumption and utility.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;
