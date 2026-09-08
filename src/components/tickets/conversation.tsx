import { cn } from "@/lib/utils";
import { UserAvatar } from "@/components/badges";
import { formatDateTime } from "@/lib/format";
import { Lock, FileText, Download } from "lucide-react";
import { formatBytes } from "@/lib/format";

interface Message {
  id: string;
  body: string;
  messageType: "PUBLIC_REPLY" | "INTERNAL_NOTE";
  authorType: "CLIENT" | "AGENT" | "SYSTEM";
  createdAt: Date | string;
  authorUser?: { id: string; name: string; image: string | null } | null;
  authorContact?: {
    id: string;
    firstName: string;
    lastName: string;
  } | null;
  attachments: {
    id: string;
    file: { id: string; filename: string; size: number };
  }[];
}

export function Conversation({
  description,
  descriptionAuthor,
  descriptionDate,
  descriptionAttachments,
  messages,
  timezone,
}: {
  description: string;
  descriptionAuthor: string;
  descriptionDate: Date | string;
  descriptionAttachments: {
    id: string;
    file: { id: string; filename: string; size: number };
  }[];
  messages: Message[];
  timezone: string;
}) {
  return (
    <div className="space-y-3">
      <MessageBubble
        author={descriptionAuthor}
        side="left"
        date={descriptionDate}
        timezone={timezone}
        badge="Original request"
        body={description}
        attachments={descriptionAttachments}
      />

      {messages.map((m) => {
        const author =
          m.authorUser?.name ??
          (m.authorContact
            ? `${m.authorContact.firstName} ${m.authorContact.lastName}`
            : "System");
        const isAgent = m.authorType === "AGENT";
        return (
          <MessageBubble
            key={m.id}
            author={author}
            image={m.authorUser?.image}
            side={isAgent ? "right" : "left"}
            date={m.createdAt}
            timezone={timezone}
            internalNote={m.messageType === "INTERNAL_NOTE"}
            body={m.body}
            attachments={m.attachments}
          />
        );
      })}
    </div>
  );
}

function MessageBubble({
  author,
  image,
  side,
  date,
  timezone,
  internalNote,
  badge,
  body,
  attachments,
}: {
  author: string;
  image?: string | null;
  side: "left" | "right";
  date: Date | string;
  timezone: string;
  internalNote?: boolean;
  badge?: string;
  body: string;
  attachments: { id: string; file: { id: string; filename: string; size: number } }[];
}) {
  return (
    <div
      className={cn(
        "flex gap-3",
        side === "right" && "flex-row-reverse",
      )}
    >
      <UserAvatar name={author} image={image} className="mt-1 size-8 shrink-0" />
      <div
        className={cn(
          "min-w-0 max-w-[85%] flex-1 rounded-lg border p-3",
          side === "right" && "bg-accent/40",
          internalNote && "border-warning/40 bg-warning/5",
        )}
      >
        <div className="mb-1 flex flex-wrap items-center gap-2 text-xs">
          <span className="font-medium text-foreground">{author}</span>
          {internalNote && (
            <span className="inline-flex items-center gap-1 rounded bg-warning/15 px-1.5 py-0.5 font-medium text-warning-foreground">
              <Lock className="size-3" /> Internal note
            </span>
          )}
          {badge && (
            <span className="rounded bg-muted px-1.5 py-0.5 text-muted-foreground">
              {badge}
            </span>
          )}
          <span className="text-muted-foreground">
            {formatDateTime(date, timezone)}
          </span>
        </div>
        <div
          className="prose-message"
          dangerouslySetInnerHTML={{ __html: body }}
        />
        {attachments.length > 0 && (
          <ul className="mt-2 flex flex-wrap gap-2">
            {attachments.map((a) => (
              <li key={a.id}>
                <a
                  href={`/api/files/${a.file.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 rounded-md border bg-background px-2 py-1 text-xs hover:bg-accent"
                >
                  <FileText className="size-3.5 text-muted-foreground" />
                  <span className="max-w-[160px] truncate">
                    {a.file.filename}
                  </span>
                  <span className="text-muted-foreground">
                    {formatBytes(a.file.size)}
                  </span>
                  <Download className="size-3 text-muted-foreground" />
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
