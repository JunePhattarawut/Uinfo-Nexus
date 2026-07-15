export default function CustomerExperiencesPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div><h1 className="text-2xl font-bold">Customer experiences</h1><p className="text-sm text-gray-500">Jira Service Management-style area for support journeys, satisfaction and service requests.</p></div>
      <div className="rounded-xl border bg-white p-6">
        <h2 className="font-bold">Improvement suggestion</h2>
        <p className="mt-2 text-sm text-gray-600">Connect this tab to service-desk projects such as CPAR, DAR, GSR, MA and TPM, then show request queues, SLA risk and customer feedback here.</p>
      </div>
    </div>
  );
}
