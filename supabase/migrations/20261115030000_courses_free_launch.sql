-- SIG-1353: free launch. Every course is free to study, so any course still
-- marked as paid or premium is reset to free with no price. The tier/price
-- columns, the (access_tier = 'paid') = (price_cents is not null) check,
-- can_access_course and the payment tables are intentionally left untouched.
update public.courses
  set access_tier = 'free',
      price_cents = null
  where access_tier <> 'free' or price_cents is not null;
