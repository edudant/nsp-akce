-- Keep the privileged publication RPC off the anonymous API surface.

revoke execute on function public.publish_pairing_run(uuid, boolean, text)
from public, anon;

grant execute on function public.publish_pairing_run(uuid, boolean, text)
to authenticated;
