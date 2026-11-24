-- Allow one adult and one child in the configured Golf Beach Resort single room.
UPDATE `room`
SET `capacity` = 2
WHERE `id` = '6c15815a-a7bb-403a-9279-36ea141d61e4'
  AND `hotel_id` = 'f9f97e1f-4fbd-4528-8dad-c3217f581880'
  AND `is_deleted` = FALSE
  AND `capacity` = 1
  AND `adult_capacity` = 1
  AND `child_capacity` = 1;
