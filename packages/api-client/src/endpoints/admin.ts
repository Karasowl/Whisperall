import type { ApiClient } from "../client";
import type {
  AdminInvoiceEntry,
  AdminInvoiceUpsertParams,
  AdminOverviewResponse,
  AdminPricingEntry,
  AdminPricingUpsertParams,
  AdminRevenueEntry,
  AdminRevenueUpsertParams,
} from "../types";

export function createAdminEndpoint(client: ApiClient) {
  return {
    overview: (month?: string) =>
      client.get<AdminOverviewResponse>(
        `/v1/admin/overview${month ? `?month=${encodeURIComponent(month)}` : ""}`,
      ),
    upsertPricing: (body: AdminPricingUpsertParams) =>
      client.postJson<AdminPricingEntry>("/v1/admin/pricing", body),
    upsertInvoice: (body: AdminInvoiceUpsertParams) =>
      client.postJson<AdminInvoiceEntry>("/v1/admin/invoices", body),
    upsertRevenue: (body: AdminRevenueUpsertParams) =>
      client.postJson<AdminRevenueEntry>("/v1/admin/revenue", body),
  };
}
