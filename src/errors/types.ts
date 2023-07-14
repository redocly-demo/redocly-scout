export interface ProblemHttpException {
  type: string;
  title: string;
  status: number;
  detail?: string;
}
