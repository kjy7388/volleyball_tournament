import { useEffect, useRef } from "react";
import { X, AlertTriangle } from "lucide-react";
import { useTournament } from "../context/TournamentContext";
import { acquireScrollLock } from "../utils/scrollLock";
export default function Modal({ title, children, onClose, wide = false }) {
  const { saving } = useTournament();
  const ref = useRef(null);
  useEffect(() => {
    const dialog = ref.current;
    const previous = dialog.ownerDocument.activeElement;
    const release = acquireScrollLock(dialog.ownerDocument);
    try {
      dialog.showModal();
    } catch (error) {
      release();
      throw error;
    }
    return () => {
      try {
        if (dialog.open) dialog.close();
      } finally {
        release();
        if (previous?.isConnected) previous.focus({ preventScroll: true });
      }
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`modal ${wide ? "wide" : ""}`}
      aria-labelledby="modal-title"
      onCancel={(e) => {
        e.preventDefault();
        if (!saving) onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current && !saving) onClose();
      }}
    >
      <fieldset className="page-fieldset" disabled={saving}>
        <div className="modal-head">
          <h2 id="modal-title">{title}</h2>
          <button
            className="icon-button"
            onClick={onClose}
            aria-label="창 닫기"
          >
            <X size={22} />
          </button>
        </div>
        {children}
      </fieldset>
    </dialog>
  );
}
export function ConfirmModal({
  title = "변경 사항을 확인해주세요",
  description,
  affected = [],
  onConfirm,
  onClose,
  confirmLabel = "확인 후 저장",
  danger = false,
}) {
  return (
    <Modal title={title} onClose={onClose}>
      <div className={`confirm-symbol ${danger ? "danger" : ""}`}>
        <AlertTriangle size={26} />
      </div>
      <p className="confirm-description">{description}</p>
      {affected.length > 0 && (
        <div className="warning">
          <strong>다음 경기의 점수와 확정 결과가 초기화됩니다.</strong>
          <p>{affected.join(", ")}</p>
          <p>새 대진에서 점수를 다시 입력해야 합니다.</p>
        </div>
      )}
      <div className="modal-actions">
        <button className="button secondary" onClick={onClose}>
          취소
        </button>
        <button
          className={`button ${danger ? "danger-button" : ""}`}
          onClick={onConfirm}
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
