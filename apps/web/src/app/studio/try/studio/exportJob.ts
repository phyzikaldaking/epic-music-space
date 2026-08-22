export type StudioExportJob = {
  id: string; format: "wav" | "mp3"; mode: "mix" | "stems"; sampleRate: 44_100 | 48_000 | 88_200 | 96_000; bitDepth: 16 | 24 | 32;
  normalize: boolean; metadata: Record<string, string>; status: "queued" | "rendering" | "complete" | "cancelled" | "failed"; progress: number; attempts: number; error?: string;
};

export function createExportJob(input: Omit<StudioExportJob, "status" | "progress" | "attempts" | "error">): StudioExportJob {
  return { ...input, metadata: { ...input.metadata }, status: "queued", progress: 0, attempts: 1 };
}

export function updateExportProgress(job: StudioExportJob, progress: number): StudioExportJob {
  const value = Math.max(0, Math.min(100, Math.round(progress)));
  return { ...job, progress: value, status: value >= 100 ? "complete" : "rendering" };
}

export function cancelExportJob(job: StudioExportJob): StudioExportJob { return { ...job, status: "cancelled" }; }
export function failExportJob(job: StudioExportJob, error: string): StudioExportJob { return { ...job, status: "failed", error }; }
export function retryExportJob(job: StudioExportJob): StudioExportJob { return { ...job, status: "queued", progress: 0, attempts: job.attempts + 1, error: undefined }; }
