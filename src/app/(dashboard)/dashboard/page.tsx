import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <h2 className="text-3xl font-bold tracking-tight text-slate-900">Dashboard</h2>
        <p className="text-slate-500">Ringkasan pencapaian dan target bulan ini.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* Placeholder cards for Phase 1 Step 1 */}
        <Card className="shadow-sm border-slate-200">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 text-slate-600 pb-2">
            <CardTitle className="text-sm font-semibold uppercase tracking-wide">
              Total Target Rp
            </CardTitle>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              className="h-4 w-4 text-indigo-500"
            >
              <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
            </svg>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900">---</div>
            <p className="text-xs text-slate-500 font-medium mt-1">April 2026</p>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-slate-200">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 text-slate-600 pb-2">
            <CardTitle className="text-sm font-semibold uppercase tracking-wide">
              Pencapaian Rp
            </CardTitle>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              className="h-4 w-4 text-indigo-500"
            >
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
            </svg>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900">---</div>
            <p className="text-xs text-slate-500 font-medium mt-1">---% dari target</p>
          </CardContent>
        </Card>
      </div>
      
      {/* We will build the actual data tables in the next step */}
      <div className="mt-8 p-8 border-2 border-dashed border-slate-200 rounded-xl flex items-center justify-center bg-slate-50 min-h-[300px]">
        <div className="text-center">
          <h3 className="text-lg font-semibold text-slate-700">Area Data (Tahap Berikutnya)</h3>
          <p className="text-sm text-slate-500 mt-1 max-w-sm mx-auto">
            Di sini akan ditampilkan tabel pencapaian per program dari Supabase database.
          </p>
        </div>
      </div>
    </div>
  )
}
