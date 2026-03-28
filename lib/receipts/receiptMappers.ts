import type {
  AssignReceiptLine,
  ParseReceiptResponse,
  ParsedReceiptLine,
  ReceiptAssignSession,
} from './receiptTypes';

export const ASSIGNEE_CYCLE = ['Titus', 'Alex', 'Sam'] as const;

function newLineId() {
  return `L${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

export function mapParsedToAssignLines(items: ParsedReceiptLine[]): AssignReceiptLine[] {
  let itemIdx = 0;
  return items.map((row) => {
    const isSpecial = row.kind !== 'item';
    let assignee = 'Split';
    if (!isSpecial) {
      if (row.unreadable) assignee = 'Assign →';
      else assignee = ASSIGNEE_CYCLE[itemIdx % ASSIGNEE_CYCLE.length] as string;
      itemIdx += 1;
    }
    return {
      ...row,
      id: newLineId(),
      assignedTo: assignee,
      selected: !row.unreadable,
    };
  });
}

export function sessionFromParse(
  res: ParseReceiptResponse,
  sourceImageUri?: string | null
): ReceiptAssignSession {
  return {
    merchantName: res.merchant_name,
    receiptDate: res.receipt_date,
    overallConfidence: res.overall_confidence,
    lines: mapParsedToAssignLines(res.line_items),
    sourceImageUri: sourceImageUri ?? null,
  };
}

export function emptyManualSession(): ReceiptAssignSession {
  return {
    merchantName: null,
    receiptDate: null,
    overallConfidence: null,
    lines: [
      {
        id: newLineId(),
        name: '',
        quantity: 1,
        unit_price: null,
        line_total: null,
        kind: 'item',
        confidence: 1,
        unreadable: true,
        assignedTo: 'Assign →',
        selected: true,
      },
    ],
    sourceImageUri: null,
  };
}
