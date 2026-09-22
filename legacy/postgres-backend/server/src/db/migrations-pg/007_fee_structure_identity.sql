DROP INDEX IF EXISTS uq_fee_structures_equivalent;

CREATE UNIQUE INDEX uq_fee_structures_equivalent
  ON fee_structures (
    school_id,
    academic_year_id,
    COALESCE(class_id, ''),
    lower(category),
    lower(fee_type),
    frequency,
    COALESCE(due_date, '')
  )
  WHERE status = 'ACTIVE';
