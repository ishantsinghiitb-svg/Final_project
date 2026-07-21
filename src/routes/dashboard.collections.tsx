import { createFileRoute, Outlet } from "@tanstack/react-router";

/**
 * Layout route for /dashboard/collections and all children.
 * Renders <Outlet /> so both the collections index and collection detail page can mount.
 *
 * Index content (the collections grid) lives in dashboard.collections.index.tsx
 * Detail content lives in dashboard.collections.$collectionId.tsx
 */
export const Route = createFileRoute("/dashboard/collections")({
  component: CollectionsLayout,
});

function CollectionsLayout() {
  return <Outlet />;
}
