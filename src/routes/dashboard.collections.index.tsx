import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { FolderKanban, Loader2, AlertCircle, Plus } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, EmptyState, StickyPageHeader } from "@/components/dashboard/primitives";
import { DashButton } from "@/components/dashboard/DashButton";
import { CollectionCard } from "@/components/dashboard/collections/CollectionCard";
import { CollectionFormDialog } from "@/components/dashboard/collections/CollectionFormDialog";
import {
  useCollections,
  useCreateCollection,
  useUpdateCollection,
  useDeleteCollection,
} from "@/features/collections/hooks";
import type { CollectionColor, CollectionWithStats } from "@/types";

export const Route = createFileRoute("/dashboard/collections/")({
  head: () => ({
    meta: [{ title: "Collections — NextOffer" }, { name: "robots", content: "noindex" }],
  }),
  component: CollectionsPage,
});

function CollectionsPage() {
  const { data: collections = [], isLoading, isError, error, isFetching } = useCollections();
  const createCollection = useCreateCollection();
  const updateCollection = useUpdateCollection();
  const deleteCollection = useDeleteCollection();

  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<CollectionWithStats | null>(null);

  const handleCreate = (fields: { name: string; description?: string; color: CollectionColor }) => {
    createCollection.mutate(fields, {
      onSuccess: (created) => {
        toast.success(`Created "${created.name}".`);
        setCreateOpen(false);
      },
      onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to create collection."),
    });
  };

  const handleRename = (fields: { name: string; description?: string; color: CollectionColor }) => {
    if (!editing) return;
    updateCollection.mutate(
      { id: editing.id, ...fields },
      {
        onSuccess: () => {
          toast.success("Collection updated.");
          setEditing(null);
        },
        onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to update collection."),
      },
    );
  };

  const handleDelete = (collection: CollectionWithStats) => {
    if (
      !confirm(
        `Delete "${collection.name}"? This removes the collection only — its ${collection.job_count} job(s) stay in Jobs/Saved.`,
      )
    ) {
      return;
    }
    deleteCollection.mutate(
      { id: collection.id },
      {
        onSuccess: () => toast.success(`Deleted "${collection.name}".`),
        onError: () => toast.error("Failed to delete collection."),
      },
    );
  };

  return (
    <>
      <StickyPageHeader>
        <PageHeader
          eyebrow="Collections"
          title="Organize saved roles your way."
          subtitle="Group jobs into lists like Dream Companies, Summer 2027, or AI Jobs — a job can live in as many collections as you like."
          actions={
            <div className="flex items-center gap-2">
              {isFetching && !isLoading && (
                <Loader2 className="h-4 w-4 animate-spin text-[oklch(0.5_0.02_265)]" />
              )}
              <DashButton onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4" /> New Collection
              </DashButton>
            </div>
          }
        />
      </StickyPageHeader>

      {isLoading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-[oklch(0.5_0.02_265)]">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading collections…
        </div>
      ) : isError ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <AlertCircle className="h-8 w-8 text-rose-500" />
          <p className="font-display text-sm font-semibold">Failed to load collections</p>
          <p className="max-w-xs text-xs text-[oklch(0.5_0.02_265)]">
            {error instanceof Error ? error.message : "An unexpected error occurred."}
          </p>
        </div>
      ) : collections.length === 0 ? (
        <EmptyState
          icon={FolderKanban}
          title="No collections yet"
          body="Create your first collection to start grouping jobs — from the Jobs board, Saved Jobs, or a job's detail page."
          cta={
            <DashButton size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" /> New Collection
            </DashButton>
          }
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {collections.map((collection) => (
            <CollectionCard
              key={collection.id}
              collection={collection}
              onEdit={setEditing}
              onDelete={handleDelete}
              isDeleting={deleteCollection.isPending && deleteCollection.variables?.id === collection.id}
            />
          ))}
        </div>
      )}

      <CollectionFormDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="New Collection"
        submitLabel="Create Collection"
        isPending={createCollection.isPending}
        onSubmit={handleCreate}
      />

      <CollectionFormDialog
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title="Edit Collection"
        submitLabel="Save Changes"
        initialName={editing?.name}
        initialDescription={editing?.description}
        initialColor={editing?.color}
        isPending={updateCollection.isPending}
        onSubmit={handleRename}
      />
    </>
  );
}
