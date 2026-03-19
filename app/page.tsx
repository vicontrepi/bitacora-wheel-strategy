export default function HomePage() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-7xl px-6 py-8 md:px-10">
        {/* NAV */}
        <header className="flex items-center justify-between border-b border-slate-800 pb-6">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Bitácora Wheel</h1>
            <p className="text-sm text-slate-400">Wheel strategy control center</p>
          </div>

          <div className="flex gap-3">
            <a
              href="/dashboard"
              className="rounded-xl border border-slate-700 px-4 py-2 text-sm text-slate-200 hover:bg-slate-900"
            >
              Demo Dashboard
            </a>

            <a
              href="/dashboard"
              className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
            >
              Start Free
            </a>
          </div>
        </header>

        {/* HERO */}
        <section className="grid items-center gap-12 py-20 md:grid-cols-2">
          <div>
            <div className="mb-4 inline-flex rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-300">
              Built for Wheel Traders
            </div>

            <h2 className="max-w-2xl text-5xl font-semibold leading-tight tracking-tight md:text-6xl">
              The control center for your{" "}
              <span className="text-indigo-400">Wheel Strategy</span>
            </h2>

            <p className="mt-6 max-w-xl text-lg leading-8 text-slate-400">
              Track Cash Secured Puts, Covered Calls, assignments, expirations,
              premium collected, capital used, and monthly ROI in one clean
              dashboard.
            </p>

            <div className="mt-8 flex flex-wrap gap-4">
              <a
                href="/dashboard"
                className="rounded-2xl bg-indigo-600 px-5 py-3 text-sm font-medium text-white hover:bg-indigo-500"
              >
                Try the App
              </a>

              <a
                href="#pricing"
                className="rounded-2xl border border-slate-700 px-5 py-3 text-sm font-medium text-slate-200 hover:bg-slate-900"
              >
                View Pricing
              </a>
            </div>

            <div className="mt-10 grid max-w-lg grid-cols-3 gap-4">
              <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
                <div className="text-xs text-slate-400">Premium</div>
                <div className="mt-2 text-2xl font-semibold text-emerald-400">$2,450</div>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
                <div className="text-xs text-slate-400">Capital Used</div>
                <div className="mt-2 text-2xl font-semibold">$18.2K</div>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
                <div className="text-xs text-slate-400">Monthly ROI</div>
                <div className="mt-2 text-2xl font-semibold text-indigo-400">4.8%</div>
              </div>
            </div>
          </div>

          {/* PRODUCT MOCKUP */}
          <div className="relative">
            <div className="absolute inset-0 rounded-[32px] bg-indigo-500/10 blur-3xl" />

            <div className="relative overflow-hidden rounded-[32px] border border-slate-800 bg-slate-900 shadow-2xl">
              <div className="border-b border-slate-800 px-6 py-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium text-slate-200">
                      Dashboard Preview
                    </div>
                    <div className="text-xs text-slate-500">
                      Premium · Capital · Open Positions · Expirations
                    </div>
                  </div>

                  <div className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs text-emerald-300">
                    Live Strategy View
                  </div>
                </div>
              </div>

              <div className="grid gap-4 p-6">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  <div className="rounded-2xl bg-slate-950 p-4">
                    <div className="text-xs text-slate-400">Net Premium</div>
                    <div className="mt-2 text-2xl font-bold text-emerald-400">$1,286</div>
                  </div>

                  <div className="rounded-2xl bg-slate-950 p-4">
                    <div className="text-xs text-slate-400">Capital at Risk</div>
                    <div className="mt-2 text-2xl font-bold">$12,400</div>
                  </div>

                  <div className="rounded-2xl bg-slate-950 p-4">
                    <div className="text-xs text-slate-400">Expiring in 7d</div>
                    <div className="mt-2 text-2xl font-bold text-amber-300">3</div>
                  </div>
                </div>

                <div className="rounded-2xl bg-slate-950 p-4">
                  <div className="mb-4 text-sm font-medium text-slate-300">
                    Open Positions
                  </div>

                  <div className="overflow-hidden rounded-xl border border-slate-800">
                    <table className="min-w-full text-sm">
                      <thead className="border-b border-slate-800 text-slate-500">
                        <tr>
                          <th className="px-4 py-3 text-left">Ticker</th>
                          <th className="px-4 py-3 text-left">Strategy</th>
                          <th className="px-4 py-3 text-left">Expiry</th>
                          <th className="px-4 py-3 text-left">Premium</th>
                          <th className="px-4 py-3 text-left">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="border-b border-slate-800">
                          <td className="px-4 py-3">IBIT</td>
                          <td className="px-4 py-3">CSP</td>
                          <td className="px-4 py-3">2026-03-20</td>
                          <td className="px-4 py-3 text-emerald-400">$300</td>
                          <td className="px-4 py-3 text-amber-300">Open</td>
                        </tr>
                        <tr className="border-b border-slate-800">
                          <td className="px-4 py-3">RIVN</td>
                          <td className="px-4 py-3">Covered Call</td>
                          <td className="px-4 py-3">2026-03-27</td>
                          <td className="px-4 py-3 text-emerald-400">$142</td>
                          <td className="px-4 py-3 text-indigo-300">Managing</td>
                        </tr>
                        <tr>
                          <td className="px-4 py-3">SOFI</td>
                          <td className="px-4 py-3">Wheel Stock</td>
                          <td className="px-4 py-3">—</td>
                          <td className="px-4 py-3 text-slate-300">—</td>
                          <td className="px-4 py-3 text-emerald-300">Assigned</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="rounded-2xl bg-slate-950 p-4">
                    <div className="mb-3 text-sm font-medium text-slate-300">
                      Monthly Performance
                    </div>
                    <div className="flex h-32 items-end gap-3">
                      <div className="w-full rounded-t-lg bg-slate-800" style={{ height: "35%" }} />
                      <div className="w-full rounded-t-lg bg-slate-700" style={{ height: "55%" }} />
                      <div className="w-full rounded-t-lg bg-indigo-500" style={{ height: "75%" }} />
                      <div className="w-full rounded-t-lg bg-emerald-500" style={{ height: "60%" }} />
                      <div className="w-full rounded-t-lg bg-indigo-400" style={{ height: "85%" }} />
                    </div>
                  </div>

                  <div className="rounded-2xl bg-slate-950 p-4">
                    <div className="mb-3 text-sm font-medium text-slate-300">
                      Wheel Status
                    </div>
                    <div className="space-y-3 text-sm">
                      <div className="flex items-center justify-between rounded-xl border border-slate-800 px-4 py-3">
                        <span>IBIT</span>
                        <span className="text-amber-300">Put Sold</span>
                      </div>
                      <div className="flex items-center justify-between rounded-xl border border-slate-800 px-4 py-3">
                        <span>RIVN</span>
                        <span className="text-indigo-300">Covered Call Active</span>
                      </div>
                      <div className="flex items-center justify-between rounded-xl border border-slate-800 px-4 py-3">
                        <span>SOFI</span>
                        <span className="text-emerald-300">Assigned Shares</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* FEATURES */}
        <section className="border-t border-slate-800 py-20">
          <div className="max-w-2xl">
            <div className="text-sm font-medium text-indigo-400">Features</div>
            <h3 className="mt-3 text-3xl font-semibold tracking-tight">
              Everything you need to manage the Wheel professionally
            </h3>
            <p className="mt-4 text-slate-400">
              Built for traders who want clarity, consistency, and a clean
              system for managing premium, assignments, expirations, and capital.
            </p>
          </div>

          <div className="mt-12 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
              <div className="text-lg font-semibold">Track CSPs</div>
              <p className="mt-3 text-sm leading-7 text-slate-400">
                Monitor strikes, expirations, premium received, and assignment
                risk for every Cash Secured Put.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
              <div className="text-lg font-semibold">Manage Covered Calls</div>
              <p className="mt-3 text-sm leading-7 text-slate-400">
                Stay on top of covered shares, call strikes, expirations, and
                premium generation across your portfolio.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
              <div className="text-lg font-semibold">Detect Assignments</div>
              <p className="mt-3 text-sm leading-7 text-slate-400">
                Follow where each ticker is in the Wheel cycle and understand
                your next likely action.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
              <div className="text-lg font-semibold">Visual Analytics</div>
              <p className="mt-3 text-sm leading-7 text-slate-400">
                Review premium by month, capital deployed, open exposure, and
                performance trends with dashboard-ready metrics.
              </p>
            </div>
          </div>
        </section>

        {/* STATS BAND */}
        <section className="border-t border-slate-800 py-20">
          <div className="grid gap-6 md:grid-cols-4">
            <div>
              <div className="text-4xl font-semibold text-white">1,240+</div>
              <div className="mt-2 text-sm text-slate-400">Trades tracked</div>
            </div>
            <div>
              <div className="text-4xl font-semibold text-white">$48K</div>
              <div className="mt-2 text-sm text-slate-400">Premium monitored</div>
            </div>
            <div>
              <div className="text-4xl font-semibold text-white">22</div>
              <div className="mt-2 text-sm text-slate-400">Active positions</div>
            </div>
            <div>
              <div className="text-4xl font-semibold text-white">4.8%</div>
              <div className="mt-2 text-sm text-slate-400">Average monthly ROI</div>
            </div>
          </div>
        </section>

        {/* PRICING */}
        <section id="pricing" className="border-t border-slate-800 py-20">
          <div className="max-w-2xl">
            <div className="text-sm font-medium text-indigo-400">Pricing</div>
            <h3 className="mt-3 text-3xl font-semibold tracking-tight">
              Start simple. Upgrade when your Wheel grows.
            </h3>
            <p className="mt-4 text-slate-400">
              Launch with a clean free tier, then unlock analytics, multi-account
              tracking, and advanced optimization.
            </p>
          </div>

          <div className="mt-12 grid gap-6 md:grid-cols-2">
            <div className="rounded-3xl border border-slate-800 bg-slate-900 p-8">
              <div className="text-lg font-semibold">Starter</div>
              <div className="mt-4 text-4xl font-bold">$0</div>
              <div className="mt-2 text-sm text-slate-400">For individual traders getting started</div>

              <ul className="mt-8 space-y-3 text-sm text-slate-300">
                <li>• 1 portfolio</li>
                <li>• Manual trade tracking</li>
                <li>• Basic dashboard</li>
                <li>• CSV import</li>
              </ul>

              <a
                href="/dashboard"
                className="mt-8 inline-block rounded-2xl border border-slate-700 px-5 py-3 text-sm font-medium hover:bg-slate-950"
              >
                Start Free
              </a>
            </div>

            <div className="rounded-3xl border border-indigo-500/30 bg-slate-900 p-8 shadow-lg shadow-indigo-500/10">
              <div className="flex items-center justify-between">
                <div className="text-lg font-semibold">Pro</div>
                <div className="rounded-full bg-indigo-500/15 px-3 py-1 text-xs text-indigo-300">
                  Most Popular
                </div>
              </div>

              <div className="mt-4 text-4xl font-bold">$19</div>
              <div className="mt-2 text-sm text-slate-400">Per month, for serious Wheel traders</div>

              <ul className="mt-8 space-y-3 text-sm text-slate-300">
                <li>• Unlimited trades</li>
                <li>• Premium and ROI analytics</li>
                <li>• Assignment tracking</li>
                <li>• Expiration alerts</li>
                <li>• Capital usage dashboard</li>
              </ul>

              <a
                href="/dashboard"
                className="mt-8 inline-block rounded-2xl bg-indigo-600 px-5 py-3 text-sm font-medium text-white hover:bg-indigo-500"
              >
                Upgrade to Pro
              </a>
            </div>
          </div>
        </section>

        {/* FINAL CTA */}
        <section className="border-t border-slate-800 py-20">
          <div className="rounded-[32px] border border-slate-800 bg-gradient-to-br from-slate-900 to-slate-950 p-10 md:p-14">
            <div className="max-w-3xl">
              <div className="text-sm font-medium text-indigo-400">
                Ready to trade with more clarity?
              </div>
              <h3 className="mt-4 text-4xl font-semibold tracking-tight">
                Stop managing your Wheel with spreadsheets.
              </h3>
              <p className="mt-4 max-w-2xl text-lg text-slate-400">
                Bitácora Wheel gives you a cleaner way to track premium, capital,
                assignments, expirations, and performance—so you can focus on
                execution, not manual bookkeeping.
              </p>

              <div className="mt-8 flex flex-wrap gap-4">
                <a
                  href="/dashboard"
                  className="rounded-2xl bg-indigo-600 px-5 py-3 text-sm font-medium text-white hover:bg-indigo-500"
                >
                  Launch Demo
                </a>

                <a
                  href="#pricing"
                  className="rounded-2xl border border-slate-700 px-5 py-3 text-sm font-medium text-slate-200 hover:bg-slate-900"
                >
                  See Pricing
                </a>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}