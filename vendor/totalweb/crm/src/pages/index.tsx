/**
 * Full-page server components. A host app mounts each one in a route, e.g.
 *   app/crm/contacts/page.tsx:  export { ContactsPage as default } from "@totalweb/crm/pages";
 */
import { CrmNav as CrmNavTabs } from "../components/CrmNav";
import { notFound } from "next/navigation";
import { CompaniesTable, ContactDetail, ContactsTable, CrmDashboard, DealsKanban, TasksList } from "../components";
import { countTasks, getContact, getDashboard, getPipelineBoard, listCompanies, listContacts, listTasks } from "../server/queries";

type SearchParams = Promise<Record<string, string | undefined>>;

/** Where the host app mounts the CRM pages (e.g. "/admin/crm"). */
const CRM_BASE = process.env.TOTALWEB_CRM_BASE ?? "/crm";

export function CrmNav({ basePath = CRM_BASE }: { basePath?: string }) {
  return <CrmNavTabs basePath={basePath} />;
}

function Header({ title }: { title: string }) {
  return <h1 className="mb-4 text-2xl font-semibold">{title}</h1>;
}

export async function CrmDashboardPage() {
  const data = await getDashboard();
  return (
    <>
      <Header title="CRM overview" />
      <CrmDashboard data={data} />
    </>
  );
}

export async function ContactsPage({ searchParams }: { searchParams: SearchParams }) {
  const { q, stage } = await searchParams;
  const [contacts, companies] = await Promise.all([listContacts({ q, stage }), listCompanies()]);
  return (
    <>
      <Header title="Contacts" />
      <ContactsTable contacts={contacts} companies={companies} basePath={CRM_BASE} />
    </>
  );
}

export async function ContactPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [data, companies] = await Promise.all([getContact(id).catch(() => null), listCompanies()]);
  if (!data) notFound();
  return <ContactDetail {...data} companies={companies} />;
}

export async function CompaniesPage() {
  const companies = await listCompanies();
  return (
    <>
      <Header title="Companies" />
      <CompaniesTable companies={companies} />
    </>
  );
}

export async function DealsPage({ searchParams }: { searchParams: SearchParams }) {
  const { pipeline: pipelineId } = await searchParams;
  const [{ pipeline, stages, deals }, contacts] = await Promise.all([getPipelineBoard(pipelineId), listContacts({ limit: 500 })]);
  if (!pipeline) return <Header title="No pipeline configured" />;
  return (
    <>
      <Header title={`Deals · ${pipeline.name}`} />
      <DealsKanban pipelineId={pipeline.id} stages={stages} deals={deals} contacts={contacts} />
    </>
  );
}

/** Open or closed tasks, one list at a time (?status=closed). */
export async function TasksPage({ searchParams }: { searchParams: SearchParams }) {
  const view = (await searchParams).status === "closed" ? "closed" : "open";
  const [tasks, counts] = await Promise.all([listTasks(view === "closed" ? "done" : "open"), countTasks()]);
  return (
    <>
      <Header title="Tasks" />
      <TasksList tasks={tasks} view={view} counts={counts} />
    </>
  );
}
