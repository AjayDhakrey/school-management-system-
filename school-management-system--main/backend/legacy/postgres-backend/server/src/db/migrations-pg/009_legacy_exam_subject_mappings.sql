INSERT INTO class_subjects(id,school_id,class_id,subject_id,teacher_id)
SELECT gen_random_uuid()::text,e.school_id,e.class_id,e.subject_id,NULL
FROM exams e
WHERE e.class_id IS NOT NULL AND e.subject_id IS NOT NULL
  AND NOT EXISTS(
    SELECT 1 FROM class_subjects cs
    WHERE cs.school_id=e.school_id AND cs.class_id=e.class_id AND cs.subject_id=e.subject_id
  )
GROUP BY e.school_id,e.class_id,e.subject_id;
