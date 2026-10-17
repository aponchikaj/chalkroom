-- Demo course for the hackathon run. `npm run db:reset` re-applies migrations and this seed.
insert into public.courses (id, title, goal, syllabus_md, visibility)
values (
  '00000000-0000-4000-8000-000000000001',
  'Solana development',
  'Write and ship a Solana program with Anchor (I know TypeScript)',
  E'# Solana development\n\n- [x] Accounts model  <!-- id: accounts -->\n- [ ] Program Derived Addresses  <!-- id: pdas, needs: accounts -->\n- [ ] Cross-program invocation  <!-- id: cpi, needs: pdas -->\n  - [ ] invoke vs invoke_signed  <!-- id: invoke-signed, needs: cpi -->\n- [ ] Anchor basics  <!-- id: anchor, needs: accounts -->\n- [ ] Tokens and the Token program  <!-- id: tokens, needs: cpi anchor -->\n',
  'public'
);
