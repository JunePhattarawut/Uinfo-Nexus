export default function CustomizeSidebarPage() {
  const options = ["Starred spaces", "Recent spaces", "Filters", "Dashboards", "Operations", "Customers", "Customer experiences", "External apps"];
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div><h1 className="text-2xl font-bold">Customize sidebar</h1><p className="text-sm text-gray-500">Preview sidebar controls. Persistence can be added next per user.</p></div>
      <div className="rounded-xl border bg-white p-5">
        <div className="space-y-3">{options.map((option) => <label key={option} className="flex items-center justify-between rounded border p-3 text-sm"><span>{option}</span><input type="checkbox" defaultChecked className="h-4 w-4" /></label>)}</div>
      </div>
    </div>
  );
}
