import styles from './ViewSkeleton.module.css';

export const ViewSkeleton = () => {
  return (
    <div
      className={styles.skeleton}
      aria-busy="true"
      aria-label="Loading content"
    >
      <div className={styles.block} />
      <div className={styles.block} />
      <div className={styles.block} />
    </div>
  );
};
