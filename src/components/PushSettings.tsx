import { createPortal } from "react-dom";
import { Bell } from 'lucide-react';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { disablePush, enablePush, getPushEnabled, pushSupported } from '../lib/pushNotifications';
import { Button, Dialog } from './Ui';

export function PushSettings({ accountId }: { accountId: string }) {
  const [open, setOpen] = useState(false);
  const query = useQueryClient();
  const key = ['push-settings', accountId];
  const status = useQuery({ queryKey: key, queryFn: getPushEnabled, enabled: open });
  const change = useMutation({
    mutationFn: (enabled: boolean) => enabled ? enablePush() : disablePush(),
    onSuccess: () => query.invalidateQueries({ queryKey: key }),
  });
  return <>
    <button type="button" className="sidebar__view-toggle" onClick={() => setOpen(true)}>
      <Bell aria-hidden="true" /><span>Notifikace</span>
    </button>
    {createPortal(<Dialog open={open} title="Push notifikace" onClose={() => { if (!change.isPending) setOpen(false); }}>
      <p>Připomenout blížící se termín pro vyjádření, pokud jste ještě neodpověděli. Připomínka přijde během posledních 24 hodin před termínem.</p>
      <p>Nastavení platí pro tento prohlížeč a zařízení.</p>
      {!pushSupported() ? <p>Prohlížeč push notifikace nepodporuje. Na iPhonu přidejte aplikaci na plochu a otevřete ji odtud.</p> :
        <Button loading={change.isPending} disabled={status.isPending || status.isError}
          onClick={() => change.mutate(!status.data)}>{status.data ? 'Vypnout notifikace' : 'Zapnout notifikace'}</Button>}
      {(status.error || change.error) && <p role="alert" className="form-error">{(change.error ?? status.error)?.message}</p>}
    </Dialog>, document.body)}
  </>;
}
