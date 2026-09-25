-- Undo 0001. This deletes every record. The migrate script refuses to run it
-- unless it is asked to by name.
drop table if exists users;
drop trigger if exists documents_guard_issued on documents;
drop function if exists guard_issued_document();
drop table if exists documents;
drop table if exists counters;
drop table if exists templates;
drop table if exists clients;
drop table if exists settings;
