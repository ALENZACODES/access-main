import { Dialog, Heading, Modal, ModalOverlay } from "react-aria-components";
import { Button } from "./Button.tsx";

export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <ModalOverlay isOpen isDismissable className="modal-overlay" onOpenChange={(open) => { if (!open) onCancel(); }}>
      <Modal className="modal">
        <Dialog className="modal-dialog">
          <Heading slot="title" level={2}>{title}</Heading>
          <p>{body}</p>
          <div className="button-row">
            <Button variant="secondary" onPress={onCancel}>{cancelLabel}</Button>
            <Button variant="primary" onPress={onConfirm}>{confirmLabel}</Button>
          </div>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
