"use client";

import { useState, useTransition } from "react";
import { Button, EmptyState, Input, Label, Modal, Table } from "@totalweb/ui";
import { saveCompany } from "../server/actions";
import type { Company } from "../types";

export function CompaniesTable({ companies }: { companies: (Company & { contacts?: { count: number }[] })[] }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setOpen(true)}>New company</Button>
      </div>
      {companies.length === 0 ? (
        <EmptyState title="No companies yet" />
      ) : (
        <Table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Domain</th>
              <th>Industry</th>
              <th>Size</th>
              <th>Contacts</th>
            </tr>
          </thead>
          <tbody>
            {companies.map((c) => (
              <tr key={c.id}>
                <td className="font-medium">{c.name}</td>
                <td className="text-muted">{c.domain}</td>
                <td>{c.industry}</td>
                <td>{c.size}</td>
                <td className="tabular-nums">{c.contacts?.[0]?.count ?? 0}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title="New company">
        <form
          className="grid gap-3"
          action={(fd) =>
            start(async () => {
              await saveCompany(Object.fromEntries(fd) as any);
              setOpen(false);
            })
          }
        >
          <div>
            <Label htmlFor="name">Name</Label>
            <Input id="name" name="name" required />
          </div>
          <div>
            <Label htmlFor="domain">Domain</Label>
            <Input id="domain" name="domain" placeholder="example.com" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="industry">Industry</Label>
              <Input id="industry" name="industry" />
            </div>
            <div>
              <Label htmlFor="size">Size</Label>
              <Input id="size" name="size" placeholder="11-50" />
            </div>
          </div>
          <div className="flex justify-end">
            <Button type="submit" disabled={pending}>
              Create
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
