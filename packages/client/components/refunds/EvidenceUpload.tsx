"use client";

import React, { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Upload, X, FileText, Image as ImageIcon, File, CheckCircle2, AlertCircle } from "lucide-react";

interface UploadedFile {
  id: string;
  name: string;
  size: number;
  type: string;
  url?: string;
  progress: number;
  status: "uploading" | "completed" | "error";
  error?: string;
}

interface EvidenceUploadProps {
  onFilesChange?: (files: UploadedFile[]) => void;
  maxFiles?: number;
  maxSizeMB?: number;
  acceptedTypes?: string[];
}

const DEFAULT_ACCEPTED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

export function EvidenceUpload({
  onFilesChange,
  maxFiles = 5,
  maxSizeMB = 10,
  acceptedTypes = DEFAULT_ACCEPTED_TYPES,
}: EvidenceUploadProps) {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + " " + sizes[i];
  };

  const getFileIcon = (type: string) => {
    if (type.startsWith("image/")) return <ImageIcon className="h-4 w-4" />;
    if (type === "application/pdf") return <FileText className="h-4 w-4" />;
    return <File className="h-4 w-4" />;
  };

  const validateFile = (file: File): { valid: boolean; error?: string } => {
    if (!acceptedTypes.includes(file.type)) {
      return {
        valid: false,
        error: `File type ${file.type} is not supported`,
      };
    }

    if (file.size > maxSizeMB * 1024 * 1024) {
      return {
        valid: false,
        error: `File size exceeds ${maxSizeMB}MB limit`,
      };
    }

    if (files.length >= maxFiles) {
      return {
        valid: false,
        error: `Maximum ${maxFiles} files allowed`,
      };
    }

    return { valid: true };
  };

  const uploadFile = async (file: File): Promise<UploadedFile> => {
    const fileId = Math.random().toString(36).substring(7);
    const newFile: UploadedFile = {
      id: fileId,
      name: file.name,
      size: file.size,
      type: file.type,
      progress: 0,
      status: "uploading",
    };

    setFiles((prev) => [...prev, newFile]);

    // Simulate upload progress
    for (let i = 0; i <= 100; i += 10) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      setFiles((prev) =>
        prev.map((f) =>
          f.id === fileId ? { ...f, progress: i } : f
        )
      );
    }

    // In a real implementation, you would upload to a server here
    // For now, we'll create a local URL
    const url = URL.createObjectURL(file);

    const completedFile: UploadedFile = {
      ...newFile,
      url,
      progress: 100,
      status: "completed",
    };

    setFiles((prev) =>
      prev.map((f) => (f.id === fileId ? completedFile : f))
    );

    return completedFile;
  };

  const handleFiles = useCallback(async (fileList: FileList) => {
    const fileArray = Array.from(fileList);

    for (const file of fileArray) {
      const validation = validateFile(file);
      if (!validation.valid) {
        const fileId = Math.random().toString(36).substring(7);
        setFiles((prev) => [
          ...prev,
          {
            id: fileId,
            name: file.name,
            size: file.size,
            type: file.type,
            progress: 0,
            status: "error",
            error: validation.error,
          },
        ]);
        continue;
      }

      await uploadFile(file);
    }
  }, [files.length, maxFiles, maxSizeMB, acceptedTypes]);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);

      if (e.dataTransfer.files) {
        handleFiles(e.dataTransfer.files);
      }
    },
    [handleFiles]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      handleFiles(e.target.files);
    }
  };

  const removeFile = (id: string) => {
    setFiles((prev) => {
      const updated = prev.filter((f) => f.id !== id);
      onFilesChange?.(updated);
      return updated;
    });
  };

  React.useEffect(() => {
    onFilesChange?.(files);
  }, [files, onFilesChange]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-serif">Upload Evidence</CardTitle>
        <CardDescription>
          Upload supporting documents (images, PDFs) for your dispute. Max {maxFiles} files, {maxSizeMB}MB each.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Drop Zone */}
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
            isDragging
              ? "border-primary bg-primary/5"
              : "border-muted-foreground/25 hover:border-muted-foreground/50"
          }`}
        >
          <Upload className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          <p className="text-sm font-medium mb-2">
            Drag and drop files here, or click to browse
          </p>
          <p className="text-xs text-muted-foreground mb-4">
            Supported formats: JPEG, PNG, WebP, PDF, DOC, DOCX
          </p>
          <input
            type="file"
            multiple
            accept={acceptedTypes.join(",")}
            onChange={handleFileInput}
            className="hidden"
            id="file-upload"
          />
          <label htmlFor="file-upload">
            <Button type="button" variant="outline" asChild>
              <span>Choose Files</span>
            </Button>
          </label>
        </div>

        {/* File List */}
        {files.length > 0 && (
          <div className="space-y-3">
            <p className="text-sm font-medium">Uploaded Files ({files.length}/{maxFiles})</p>
            {files.map((file) => (
              <div
                key={file.id}
                className="flex items-center gap-3 p-3 border rounded-lg bg-background"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                  {getFileIcon(file.type)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{file.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatFileSize(file.size)}
                  </p>
                  {file.status === "uploading" && (
                    <Progress value={file.progress} className="h-1 mt-1" />
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {file.status === "completed" && (
                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                  )}
                  {file.status === "error" && (
                    <AlertCircle className="h-5 w-5 text-red-600" />
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeFile(file.id)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {files.some((f) => f.status === "error") && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Some files failed to upload. Please check the error messages and try again.
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
