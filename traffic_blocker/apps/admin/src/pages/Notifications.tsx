import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Banner, Button, Card, Page, Text } from "@shopify/polaris";
import { api } from "../api";

interface Note { _id: string; title: string; body: string; read: boolean; createdAt: string; emailStatus: string }

export function NotificationsPage({ notify }: { notify: (message: string) => void }) {
  const client = useQueryClient();
  const query = useQuery({ queryKey: ["notes"], queryFn: () => api<Note[]>("/api/v1/notifications") });
  const read = useMutation({
    mutationFn: (id: string) => api(`/api/v1/notifications/${id}/read`, { method: "POST" }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["notes"] });
      notify("Notification marked read");
    },
    onError: (error: Error) => notify(error.message),
  });
  const notes = query.data ?? [];
  return (
    <Page title="Notifications" subtitle="Email is sent only when SMTP is configured. Otherwise the status stays skipped.">
      {query.isError ? <Banner tone="critical" title={query.error instanceof Error ? query.error.message : "Notifications could not be loaded"} /> : (
        <Card padding="0">
          <div className="tb-card-head">
            <Text as="h2" variant="headingMd">Inbox</Text>
          </div>
          {notes.length === 0 ? <p className="tb-empty">Country changes, attacks, and edge failures show up here.</p> : notes.map((note) => (
            <article className="tb-note" key={note._id}>
              <div>
                <strong>{note.title}</strong>
                <p>{note.body}</p>
                <span>{new Date(note.createdAt).toLocaleString()} · Email {note.emailStatus.replaceAll("_", " ")}</span>
              </div>
              {note.read ? <span className="tb-pill tb-pill-muted">Read</span> : <Button variant="plain" disabled={read.isPending} onClick={() => read.mutate(note._id)}>Mark read</Button>}
            </article>
          ))}
        </Card>
      )}
    </Page>
  );
}
