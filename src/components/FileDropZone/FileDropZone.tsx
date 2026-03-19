import { useCallback, useId, useRef, useState } from 'react';
import type { ChangeEvent, DragEvent, KeyboardEvent } from 'react';

import styles from './FileDropZone.module.css';

interface FileDropZoneProps {
  onFilesSelected: (files: File[]) => void;
  accept?: string;
  multiple?: boolean;
  label?: string;
  activeLabel?: string;
  className?: string;
}

export function FileDropZone({
  onFilesSelected,
  accept = '.spc',
  multiple = false,
  label = 'Drop SPC file here or click to browse',
  activeLabel = 'Drop SPC file here',
  className,
}: FileDropZoneProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const dropZoneId = useId();
  const labelId = `${dropZoneId}-label`;

  const handleFileChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files && files.length > 0) {
        onFilesSelected(Array.from(files));
      }
      // Reset input so selecting the same file again triggers onChange
      e.target.value = '';
    },
    [onFilesSelected],
  );

  const handleDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragOver(false);
      const files = Array.from(e.dataTransfer.files).filter((f) => {
        if (!accept) return true;
        const extensions = accept
          .split(',')
          .map((ext) => ext.trim().toLowerCase());
        return extensions.some((ext) => f.name.toLowerCase().endsWith(ext));
      });
      if (files.length > 0) {
        onFilesSelected(multiple ? files : [files[0]]);
      }
    },
    [accept, multiple, onFilesSelected],
  );

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragOver(false);
    }
  }, []);

  const handleClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      fileInputRef.current?.click();
    }
  }, []);

  return (
    <div
      className={`${styles.dropZone} ${isDragOver ? styles.dropZoneActive : ''} ${className ?? ''}`}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
      aria-labelledby={labelId}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        onChange={handleFileChange}
        className={styles.fileInput}
        aria-hidden="true"
        tabIndex={-1}
      />
      <span id={labelId} className={styles.dropZoneText}>
        {isDragOver ? activeLabel : label}
      </span>
    </div>
  );
}
