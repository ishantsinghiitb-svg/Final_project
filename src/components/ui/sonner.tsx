import { Toaster as Sonner } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

/**
 * `classNames.toast` is applied by sonner to every toast, including ones
 * rendered with `toast.custom(..., { unstyled: true })`. Because `bg-background`
 * resolves to the dark marketing token, a custom card such as WorkflowPrompt
 * was being drawn on top of a near-black rounded rectangle, which showed
 * through as dark corners around the card. The `data-styled="false"` rules in
 * styles.css strip the wrapper for unstyled toasts so the custom card is the
 * only thing painted.
 */
const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      className="toaster group"
      offset={24}
      mobileOffset={16}
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-muted-foreground",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
