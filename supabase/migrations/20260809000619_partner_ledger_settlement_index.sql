create index if not exists partner_ledger_settlement_id_idx
  on public.partner_ledger_entries (settlement_id);
