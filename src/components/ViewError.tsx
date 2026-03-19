import styles from './ViewError.module.css';

export const ViewError = ({ message }: { message: string }) => {
  return (
    <div className={styles.error} role="alert">
      <h2>Something went wrong</h2>
      <p>{message}</p>
    </div>
  );
};
