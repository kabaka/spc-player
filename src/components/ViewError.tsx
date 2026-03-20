import styles from './ViewError.module.css';

interface ViewErrorProps {
  readonly message: string;
  readonly onRetry?: () => void;
}

export const ViewError = ({ message, onRetry }: ViewErrorProps) => {
  return (
    <div className={styles.error} role="alert">
      <h2>Something went wrong</h2>
      <p>{message}</p>
      {onRetry && (
        <button type="button" className={styles.retryButton} onClick={onRetry}>
          Try Again
        </button>
      )}
    </div>
  );
};
