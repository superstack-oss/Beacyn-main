import { useState } from 'react';
import { AlertCircle, Check } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Button } from '../ui/button';
import type { DataCenterDetail, DataCenterType, DcRole, OperationalWorkHours, YesNoOption } from '../../lib/datacenters';

export type DataCenterFormPayload = {
  name: string;
  dcCode: string;
  type: DataCenterType;
  dcRole: DcRole;
  region: string;
  regionGroup: string;
  country: string;
  city: string;
  address: string;
  exactAddress: string;
  ownerCompany: string;
  businessUnit: string;
  vendorProvider: string;
  contactPerson: string;
  contactEmail: string;
  contactPhone: string;
  nocPhone: string;
  nocEmail: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  emergencyContactEmail: string;
  buildingType: string;
  redundancyLevel: string;
  rackTotal: number;
  rackUsed: number;
  rackAvailable: number;
  powerCapacity: string;
  upsBackupDuration: string;
  generatorCapacity: string;
  ispPrimary: string;
  ispSecondary: string;
  bandwidthPrimary: string;
  bandwidthSecondary: string;
  physicalServers: number;
  virtualizationHosts: number;
  storageArrays: number;
  networkDevices: number;
  racksOccupied: number;
  operationalWorkHours: OperationalWorkHours;
  visitorAccessNeeded: YesNoOption;
  visitorName: string;
  visitorPhone: string;
  visitorEmail: string;
  visitorVendor: string;
  visitDuration: string;
  specialInstructions: string;
};

interface DataCenterFormProps {
  dataCenter?: DataCenterDetail | null;
  onSave: (data: DataCenterFormPayload) => Promise<void> | void;
  onCancel: () => void;
}

const dcTypes = [
  { value: 'colocation', label: 'Colocation' },
  { value: 'shared', label: 'Shared' },
  { value: 'private', label: 'Private' },
] as const;

const operationalHoursOptions: OperationalWorkHours[] = ['9-5', '8-6', '24x7', '24x5'];
const yesNoOptions: YesNoOption[] = ['Yes', 'No'];

function ErrorText({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <div className="mt-1 flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
      <AlertCircle className="h-4 w-4" />
      {message}
    </div>
  );
}

export default function DataCenterForm({ dataCenter, onSave, onCancel }: DataCenterFormProps) {
  const isNew = !dataCenter;
  const [formData, setFormData] = useState<DataCenterFormPayload>({
    name: dataCenter?.name || '',
    dcCode: dataCenter?.dcCode || '',
    type: dataCenter?.type || 'colocation',
    dcRole: dataCenter?.dcRole || 'Primary',
    region: dataCenter?.region || '',
    regionGroup: dataCenter?.regionGroup || '',
    country: dataCenter?.country || '',
    city: dataCenter?.city || '',
    address: dataCenter?.address || '',
    exactAddress: dataCenter?.exactAddress || dataCenter?.address || '',
    ownerCompany: dataCenter?.ownerCompany || '',
    businessUnit: dataCenter?.businessUnit || '',
    vendorProvider: dataCenter?.vendorProvider || '',
    contactPerson: dataCenter?.contactPerson || '',
    contactEmail: dataCenter?.contactEmail || '',
    contactPhone: dataCenter?.contactPhone || '',
    nocPhone: dataCenter?.nocContact.phone || '',
    nocEmail: dataCenter?.nocContact.email || '',
    emergencyContactName: dataCenter?.emergencyContact.name || '',
    emergencyContactPhone: dataCenter?.emergencyContact.phone || dataCenter?.escalationContact || '',
    emergencyContactEmail: dataCenter?.emergencyContact.email || '',
    buildingType: dataCenter?.facility.buildingType || '',
    redundancyLevel: dataCenter?.facility.redundancyLevel || '',
    rackTotal: dataCenter?.facility.rackCapacity.total || 0,
    rackUsed: dataCenter?.facility.rackCapacity.used || 0,
    rackAvailable: dataCenter?.facility.rackCapacity.available || 0,
    powerCapacity: dataCenter?.facility.powerCapacity || '',
    upsBackupDuration: dataCenter?.facility.upsBackupDuration || '',
    generatorCapacity: dataCenter?.facility.generatorCapacity || '',
    ispPrimary: dataCenter?.network.ispProviders.primary || '',
    ispSecondary: dataCenter?.network.ispProviders.secondary || '',
    bandwidthPrimary: dataCenter?.network.bandwidthPerLink.primary || '',
    bandwidthSecondary: dataCenter?.network.bandwidthPerLink.secondary || '',
    physicalServers: dataCenter?.inventory.physicalServers || 0,
    virtualizationHosts: dataCenter?.inventory.virtualizationHosts || 0,
    storageArrays: dataCenter?.inventory.storageArrays || 0,
    networkDevices: dataCenter?.inventory.networkDevices || 0,
    racksOccupied: dataCenter?.inventory.racksOccupied || 0,
    operationalWorkHours: dataCenter?.guardrails?.operationalWorkHours || '24x7',
    visitorAccessNeeded: dataCenter?.guardrails?.visitorAccessNeeded || 'No',
    visitorName: dataCenter?.guardrails?.visitorDetails?.name || '',
    visitorPhone: dataCenter?.guardrails?.visitorDetails?.phone || '',
    visitorEmail: dataCenter?.guardrails?.visitorDetails?.officialEmail || '',
    visitorVendor: dataCenter?.guardrails?.visitorDetails?.vendor || '',
    visitDuration: dataCenter?.guardrails?.visitorDetails?.visitDuration || '',
    specialInstructions: dataCenter?.guardrails?.visitorDetails?.specialInstructions || '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleChange = (field: keyof DataCenterFormPayload, value: string | number) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  };

  const validateForm = () => {
    const nextErrors: Record<string, string> = {};
    if (!formData.name.trim()) nextErrors.name = 'Data center name is required';
    if (!formData.dcCode.trim()) nextErrors.dcCode = 'DC code is required';
    if (!formData.region.trim()) nextErrors.region = 'Region is required';
    if (!formData.country.trim()) nextErrors.country = 'Country is required';
    if (!formData.city.trim()) nextErrors.city = 'City is required';
    if (!formData.address.trim()) nextErrors.address = 'Address is required';
    if (!formData.ownerCompany.trim()) nextErrors.ownerCompany = 'Owner company is required';
    if (!formData.vendorProvider.trim()) nextErrors.vendorProvider = 'Vendor/provider is required';
    if (!formData.contactPerson.trim()) nextErrors.contactPerson = 'Primary owner is required';
    if (!formData.contactPhone.trim()) nextErrors.contactPhone = 'Primary owner phone is required';
    if (!formData.contactEmail.trim()) {
      nextErrors.contactEmail = 'Primary owner email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.contactEmail)) {
      nextErrors.contactEmail = 'Invalid email format';
    }
    if (!formData.nocPhone.trim()) nextErrors.nocPhone = '24x7 NOC phone is required';
    if (!formData.nocEmail.trim()) {
      nextErrors.nocEmail = '24x7 NOC email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.nocEmail)) {
      nextErrors.nocEmail = 'Invalid email format';
    }
    if (!formData.emergencyContactName.trim()) nextErrors.emergencyContactName = 'Emergency contact name is required';
    if (!formData.emergencyContactPhone.trim()) nextErrors.emergencyContactPhone = 'Emergency contact phone is required';
    if (formData.emergencyContactEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.emergencyContactEmail)) {
      nextErrors.emergencyContactEmail = 'Invalid email format';
    }
    if (formData.visitorAccessNeeded === 'Yes') {
      if (!formData.visitorName.trim()) nextErrors.visitorName = 'Visitor name is required';
      if (!formData.visitorPhone.trim()) nextErrors.visitorPhone = 'Visitor phone is required';
      if (!formData.visitorEmail.trim()) {
        nextErrors.visitorEmail = 'Official email is required';
      } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.visitorEmail)) {
        nextErrors.visitorEmail = 'Invalid email format';
      }
      if (!formData.visitorVendor.trim()) nextErrors.visitorVendor = 'Vendor is required';
      if (!formData.visitDuration.trim()) nextErrors.visitDuration = 'Visit duration is required';
    }
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!validateForm()) return;
    setIsSubmitting(true);
    try {
      await Promise.resolve(onSave({
        ...formData,
        rackAvailable: formData.rackAvailable || Math.max(0, formData.rackTotal - formData.rackUsed),
      }));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Card className="border-zinc-200 dark:border-zinc-800">
        <CardHeader>
          <CardTitle>{isNew ? 'Add Data Center' : 'Edit Data Center'}</CardTitle>
          <CardDescription>Step 1 captures the site. Continuity map design happens separately after the DC exists.</CardDescription>
        </CardHeader>
      </Card>

      <Card className="border-zinc-200 dark:border-zinc-800">
        <CardHeader>
          <CardTitle className="text-lg">Core Identity</CardTitle>
          <CardDescription>Ownership, classification, and geographic identity.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="name">Data Center Name</Label>
            <Input id="name" value={formData.name} onChange={(e) => handleChange('name', e.target.value)} className={errors.name ? 'border-red-500' : ''} disabled={isSubmitting} />
            <ErrorText message={errors.name} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="dcCode">DC Code</Label>
            <Input id="dcCode" value={formData.dcCode} onChange={(e) => handleChange('dcCode', e.target.value)} className={errors.dcCode ? 'border-red-500' : ''} disabled={isSubmitting} />
            <ErrorText message={errors.dcCode} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="type">Infrastructure Type</Label>
            <select id="type" value={formData.type} onChange={(e) => handleChange('type', e.target.value as DataCenterType)} disabled={isSubmitting} className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50">
              {dcTypes.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="dcRole">DC Role</Label>
            <select id="dcRole" value={formData.dcRole} onChange={(e) => handleChange('dcRole', e.target.value as DcRole)} disabled={isSubmitting} className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50">
              <option value="Primary">Primary</option>
              <option value="Disaster Recovery">Disaster Recovery</option>
              <option value="Backup Site">Backup Site</option>
              <option value="Edge DC">Edge DC</option>
            </select>
          </div>
          <div className="space-y-2"><Label htmlFor="region">Region</Label><Input id="region" value={formData.region} onChange={(e) => handleChange('region', e.target.value)} className={errors.region ? 'border-red-500' : ''} disabled={isSubmitting} /><ErrorText message={errors.region} /></div>
          <div className="space-y-2"><Label htmlFor="regionGroup">Region Group</Label><Input id="regionGroup" value={formData.regionGroup} onChange={(e) => handleChange('regionGroup', e.target.value)} disabled={isSubmitting} /></div>
          <div className="space-y-2"><Label htmlFor="country">Country</Label><Input id="country" value={formData.country} onChange={(e) => handleChange('country', e.target.value)} className={errors.country ? 'border-red-500' : ''} disabled={isSubmitting} /><ErrorText message={errors.country} /></div>
          <div className="space-y-2"><Label htmlFor="city">City</Label><Input id="city" value={formData.city} onChange={(e) => handleChange('city', e.target.value)} className={errors.city ? 'border-red-500' : ''} disabled={isSubmitting} /><ErrorText message={errors.city} /></div>
          <div className="space-y-2 md:col-span-2"><Label htmlFor="address">Address</Label><Input id="address" value={formData.address} onChange={(e) => handleChange('address', e.target.value)} className={errors.address ? 'border-red-500' : ''} disabled={isSubmitting} /><ErrorText message={errors.address} /></div>
          <div className="space-y-2 md:col-span-2"><Label htmlFor="exactAddress">Exact Address</Label><Input id="exactAddress" value={formData.exactAddress} onChange={(e) => handleChange('exactAddress', e.target.value)} disabled={isSubmitting} /></div>
          <div className="space-y-2"><Label htmlFor="ownerCompany">Owner Company</Label><Input id="ownerCompany" value={formData.ownerCompany} onChange={(e) => handleChange('ownerCompany', e.target.value)} className={errors.ownerCompany ? 'border-red-500' : ''} disabled={isSubmitting} /><ErrorText message={errors.ownerCompany} /></div>
          <div className="space-y-2"><Label htmlFor="businessUnit">Business Unit</Label><Input id="businessUnit" value={formData.businessUnit} onChange={(e) => handleChange('businessUnit', e.target.value)} disabled={isSubmitting} /></div>
          <div className="space-y-2 md:col-span-2"><Label htmlFor="vendorProvider">Vendor / Provider</Label><Input id="vendorProvider" value={formData.vendorProvider} onChange={(e) => handleChange('vendorProvider', e.target.value)} className={errors.vendorProvider ? 'border-red-500' : ''} disabled={isSubmitting} /><ErrorText message={errors.vendorProvider} /></div>
        </CardContent>
      </Card>

      <Card className="border-zinc-200 dark:border-zinc-800">
        <CardHeader>
          <CardTitle className="text-lg">Escalation Contacts</CardTitle>
          <CardDescription>The essential contacts used in planned activity and outage bridges.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2"><Label htmlFor="contactPerson">Primary Owner</Label><Input id="contactPerson" value={formData.contactPerson} onChange={(e) => handleChange('contactPerson', e.target.value)} className={errors.contactPerson ? 'border-red-500' : ''} disabled={isSubmitting} /><ErrorText message={errors.contactPerson} /></div>
          <div className="space-y-2"><Label htmlFor="contactEmail">Primary Owner Email</Label><Input id="contactEmail" type="email" value={formData.contactEmail} onChange={(e) => handleChange('contactEmail', e.target.value)} className={errors.contactEmail ? 'border-red-500' : ''} disabled={isSubmitting} /><ErrorText message={errors.contactEmail} /></div>
          <div className="space-y-2"><Label htmlFor="contactPhone">Primary Owner Phone</Label><Input id="contactPhone" value={formData.contactPhone} onChange={(e) => handleChange('contactPhone', e.target.value)} className={errors.contactPhone ? 'border-red-500' : ''} disabled={isSubmitting} /><ErrorText message={errors.contactPhone} /></div>
          <div className="space-y-2"><Label htmlFor="nocPhone">24x7 NOC Phone</Label><Input id="nocPhone" value={formData.nocPhone} onChange={(e) => handleChange('nocPhone', e.target.value)} className={errors.nocPhone ? 'border-red-500' : ''} disabled={isSubmitting} /><ErrorText message={errors.nocPhone} /></div>
          <div className="space-y-2"><Label htmlFor="nocEmail">24x7 NOC Email</Label><Input id="nocEmail" type="email" value={formData.nocEmail} onChange={(e) => handleChange('nocEmail', e.target.value)} className={errors.nocEmail ? 'border-red-500' : ''} disabled={isSubmitting} /><ErrorText message={errors.nocEmail} /></div>
          <div className="space-y-2"><Label htmlFor="emergencyContactName">Emergency Bridge / Contact</Label><Input id="emergencyContactName" value={formData.emergencyContactName} onChange={(e) => handleChange('emergencyContactName', e.target.value)} className={errors.emergencyContactName ? 'border-red-500' : ''} disabled={isSubmitting} /><ErrorText message={errors.emergencyContactName} /></div>
          <div className="space-y-2"><Label htmlFor="emergencyContactPhone">Emergency Phone</Label><Input id="emergencyContactPhone" value={formData.emergencyContactPhone} onChange={(e) => handleChange('emergencyContactPhone', e.target.value)} className={errors.emergencyContactPhone ? 'border-red-500' : ''} disabled={isSubmitting} /><ErrorText message={errors.emergencyContactPhone} /></div>
          <div className="space-y-2"><Label htmlFor="emergencyContactEmail">Emergency Email</Label><Input id="emergencyContactEmail" type="email" value={formData.emergencyContactEmail} onChange={(e) => handleChange('emergencyContactEmail', e.target.value)} className={errors.emergencyContactEmail ? 'border-red-500' : ''} disabled={isSubmitting} /><ErrorText message={errors.emergencyContactEmail} /></div>
        </CardContent>
      </Card>

      <Card className="border-zinc-200 dark:border-zinc-800">
        <CardHeader>
          <CardTitle className="text-lg">Capacity & Resilience</CardTitle>
          <CardDescription>Site capacity and resilience profile.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <div className="space-y-2"><Label htmlFor="buildingType">Facility Tier / Type</Label><Input id="buildingType" value={formData.buildingType} onChange={(e) => handleChange('buildingType', e.target.value)} disabled={isSubmitting} /></div>
          <div className="space-y-2"><Label htmlFor="redundancyLevel">Redundancy Level</Label><Input id="redundancyLevel" value={formData.redundancyLevel} onChange={(e) => handleChange('redundancyLevel', e.target.value)} disabled={isSubmitting} /></div>
          <div className="space-y-2"><Label htmlFor="powerCapacity">Power Capacity</Label><Input id="powerCapacity" value={formData.powerCapacity} onChange={(e) => handleChange('powerCapacity', e.target.value)} disabled={isSubmitting} /></div>
          <div className="space-y-2"><Label htmlFor="upsBackupDuration">UPS Backup Duration</Label><Input id="upsBackupDuration" value={formData.upsBackupDuration} onChange={(e) => handleChange('upsBackupDuration', e.target.value)} disabled={isSubmitting} /></div>
          <div className="space-y-2"><Label htmlFor="generatorCapacity">Generator Capacity</Label><Input id="generatorCapacity" value={formData.generatorCapacity} onChange={(e) => handleChange('generatorCapacity', e.target.value)} disabled={isSubmitting} /></div>
          <div className="space-y-2"><Label htmlFor="rackTotal">Rack Capacity Total</Label><Input id="rackTotal" type="number" value={formData.rackTotal} onChange={(e) => handleChange('rackTotal', Number(e.target.value || 0))} disabled={isSubmitting} /></div>
          <div className="space-y-2"><Label htmlFor="rackUsed">Rack Capacity Used</Label><Input id="rackUsed" type="number" value={formData.rackUsed} onChange={(e) => handleChange('rackUsed', Number(e.target.value || 0))} disabled={isSubmitting} /></div>
          <div className="space-y-2"><Label htmlFor="rackAvailable">Rack Capacity Available</Label><Input id="rackAvailable" type="number" value={formData.rackAvailable} onChange={(e) => handleChange('rackAvailable', Number(e.target.value || 0))} disabled={isSubmitting} /></div>
          <div className="space-y-2"><Label htmlFor="ispPrimary">Primary ISP</Label><Input id="ispPrimary" value={formData.ispPrimary} onChange={(e) => handleChange('ispPrimary', e.target.value)} disabled={isSubmitting} /></div>
          <div className="space-y-2"><Label htmlFor="ispSecondary">Secondary ISP</Label><Input id="ispSecondary" value={formData.ispSecondary} onChange={(e) => handleChange('ispSecondary', e.target.value)} disabled={isSubmitting} /></div>
          <div className="space-y-2"><Label htmlFor="bandwidthPrimary">Primary Bandwidth</Label><Input id="bandwidthPrimary" value={formData.bandwidthPrimary} onChange={(e) => handleChange('bandwidthPrimary', e.target.value)} disabled={isSubmitting} /></div>
          <div className="space-y-2"><Label htmlFor="bandwidthSecondary">Secondary Bandwidth</Label><Input id="bandwidthSecondary" value={formData.bandwidthSecondary} onChange={(e) => handleChange('bandwidthSecondary', e.target.value)} disabled={isSubmitting} /></div>
        </CardContent>
      </Card>

      <Card className="border-zinc-200 dark:border-zinc-800">
        <CardHeader>
          <CardTitle className="text-lg">Operational Guardrails</CardTitle>
          <CardDescription>Visitor access expectations and working-hour guidance for site operations.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="dcOperational">DC Operational Coverage</Label>
              <Input id="dcOperational" value="24x7" readOnly disabled className="bg-zinc-50 dark:bg-zinc-900" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="operationalWorkHours">DC Operational Work Hours</Label>
              <select id="operationalWorkHours" value={formData.operationalWorkHours} onChange={(e) => handleChange('operationalWorkHours', e.target.value as OperationalWorkHours)} disabled={isSubmitting} className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50">
                {operationalHoursOptions.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="visitorAccessNeeded">Visitor Site Access Needed</Label>
              <select id="visitorAccessNeeded" value={formData.visitorAccessNeeded} onChange={(e) => handleChange('visitorAccessNeeded', e.target.value as YesNoOption)} disabled={isSubmitting} className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50">
                {yesNoOptions.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </div>
          </div>

          {formData.visitorAccessNeeded === 'Yes' ? (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2"><Label htmlFor="visitorName">Visitor Name</Label><Input id="visitorName" value={formData.visitorName} onChange={(e) => handleChange('visitorName', e.target.value)} className={errors.visitorName ? 'border-red-500' : ''} disabled={isSubmitting} /><ErrorText message={errors.visitorName} /></div>
              <div className="space-y-2"><Label htmlFor="visitorPhone">Visitor Phone</Label><Input id="visitorPhone" value={formData.visitorPhone} onChange={(e) => handleChange('visitorPhone', e.target.value)} className={errors.visitorPhone ? 'border-red-500' : ''} disabled={isSubmitting} /><ErrorText message={errors.visitorPhone} /></div>
              <div className="space-y-2"><Label htmlFor="visitorEmail">Official Email</Label><Input id="visitorEmail" type="email" value={formData.visitorEmail} onChange={(e) => handleChange('visitorEmail', e.target.value)} className={errors.visitorEmail ? 'border-red-500' : ''} disabled={isSubmitting} /><ErrorText message={errors.visitorEmail} /></div>
              <div className="space-y-2"><Label htmlFor="visitorVendor">Vendor</Label><Input id="visitorVendor" value={formData.visitorVendor} onChange={(e) => handleChange('visitorVendor', e.target.value)} className={errors.visitorVendor ? 'border-red-500' : ''} disabled={isSubmitting} /><ErrorText message={errors.visitorVendor} /></div>
              <div className="space-y-2"><Label htmlFor="visitDuration">Visit Duration</Label><Input id="visitDuration" value={formData.visitDuration} onChange={(e) => handleChange('visitDuration', e.target.value)} className={errors.visitDuration ? 'border-red-500' : ''} disabled={isSubmitting} /><ErrorText message={errors.visitDuration} /></div>
              <div className="space-y-2 md:col-span-2"><Label htmlFor="specialInstructions">Special Instructions</Label><textarea id="specialInstructions" value={formData.specialInstructions} onChange={(e) => handleChange('specialInstructions', e.target.value)} disabled={isSubmitting} rows={4} className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50" /></div>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-zinc-200 bg-zinc-50/70 px-4 py-3 text-sm text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900/40 dark:text-zinc-300">
              No visitor access details are required for this site.
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-zinc-200 dark:border-zinc-800">
        <CardHeader>
          <CardTitle className="text-lg">Hosted Inventory</CardTitle>
          <CardDescription>Headline inventory counts only. Continuity relationships are configured later.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <div className="space-y-2"><Label htmlFor="physicalServers">Physical Servers</Label><Input id="physicalServers" type="number" value={formData.physicalServers} onChange={(e) => handleChange('physicalServers', Number(e.target.value || 0))} disabled={isSubmitting} /></div>
          <div className="space-y-2"><Label htmlFor="virtualizationHosts">Virtualization Hosts</Label><Input id="virtualizationHosts" type="number" value={formData.virtualizationHosts} onChange={(e) => handleChange('virtualizationHosts', Number(e.target.value || 0))} disabled={isSubmitting} /></div>
          <div className="space-y-2"><Label htmlFor="storageArrays">Storage Arrays</Label><Input id="storageArrays" type="number" value={formData.storageArrays} onChange={(e) => handleChange('storageArrays', Number(e.target.value || 0))} disabled={isSubmitting} /></div>
          <div className="space-y-2"><Label htmlFor="networkDevices">Network Devices</Label><Input id="networkDevices" type="number" value={formData.networkDevices} onChange={(e) => handleChange('networkDevices', Number(e.target.value || 0))} disabled={isSubmitting} /></div>
          <div className="space-y-2"><Label htmlFor="racksOccupied">Racks Occupied</Label><Input id="racksOccupied" type="number" value={formData.racksOccupied} onChange={(e) => handleChange('racksOccupied', Number(e.target.value || 0))} disabled={isSubmitting} /></div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>Cancel</Button>
        <Button type="submit" disabled={isSubmitting} className="gap-2">
          <Check className="h-4 w-4" />
          {isSubmitting ? 'Saving...' : isNew ? 'Create Data Center' : 'Save Changes'}
        </Button>
      </div>
    </form>
  );
}
