export type ReceiptLineKind = 'item' | 'tax' | 'tip' | 'fee' | 'unknown';

/** API / server shape after parse */
export type ParsedReceiptLine = {
  name: string;
  quantity: number;
  unit_price: number | null;
  line_total: number | null;
  kind: ReceiptLineKind;
  confidence: number;
  unreadable: boolean;
};

export type ParseReceiptResponse = {
  merchant_name: string | null;
  receipt_date: string | null;
  overall_confidence: number | null;
  line_items: ParsedReceiptLine[];
};

/** Row on assign screen (mutable UI state) */
export type AssignReceiptLine = ParsedReceiptLine & {
  id: string;
  assignedTo: string;
  selected: boolean;
};

export type ReceiptAssignSession = {
  merchantName: string | null;
  receiptDate: string | null;
  overallConfidence: number | null;
  lines: AssignReceiptLine[];
  sourceImageUri?: string | null;
};
