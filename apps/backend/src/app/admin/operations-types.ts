import type {
  AdminOperationsData,
  AdminOperationsInput,
} from "@/application/queries/admin-operations";

export type OperationsQuery = {
  error?: string;
  q?: string;
  status?: string;
  page?: string;
  created?: string;
  manage?: string;
  managePayment?: string;
  paymentQ?: string;
  paymentStatus?: string;
  paymentType?: string;
  paymentPage?: string;
  payoutPage?: string;
  evidencePage?: string;
  failurePage?: string;
  fulfillmentPage?: string;
  work?: string;
};

export interface OperationsScreenProps {
  data: AdminOperationsData;
  query: OperationsQuery;
  view: AdminOperationsInput["view"];
  returnTo: string;
  filters: {
    search: string;
    status: string;
    page: number;
    paymentSearch: string;
    paymentStatus: string;
    paymentType: string;
    paymentPage: number;
    evidencePage: number;
    failurePage: number;
    fulfillmentPage: number;
  };
}
