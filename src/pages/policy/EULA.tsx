import { useState, useEffect } from 'react';
import { ArrowLeft, ShieldCheck, Scale, Building2, GitBranch, Globe } from 'lucide-react';
import { AuthHeader } from '../../components/auth/AuthHeader';

function Section({ id, title, children }: { id?: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="space-y-3">
      <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50 border-b border-zinc-200 dark:border-zinc-800 pb-2">{title}</h2>
      <div className="space-y-3 text-zinc-600 dark:text-zinc-400">{children}</div>
    </section>
  );
}

function Sub({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">{title}</h3>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function LicenseTierCard({
  icon: Icon, tier, tag, tagColor, items, footer,
}: {
  icon: React.ElementType;
  tier: string;
  tag: string;
  tagColor: string;
  items: string[];
  footer?: string;
}) {
  return (
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 p-5 space-y-3 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-100 dark:bg-zinc-800">
            <Icon className="w-4 h-4 text-zinc-600 dark:text-zinc-300" />
          </span>
          <span className="font-semibold text-sm text-zinc-900 dark:text-zinc-50">{tier}</span>
        </div>
        <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full border ${tagColor}`}>{tag}</span>
      </div>
      <ul className="space-y-1.5 text-sm text-zinc-600 dark:text-zinc-400">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-2">
            <span className="mt-0.5 h-4 w-4 shrink-0 flex items-center justify-center rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 text-[10px] font-bold">✓</span>
            {item}
          </li>
        ))}
      </ul>
      {footer && <p className="text-xs text-zinc-400 dark:text-zinc-500 border-t border-zinc-100 dark:border-zinc-800 pt-3">{footer}</p>}
    </div>
  );
}

export default function EULAPage() {
  const [isDark, setIsDark] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('theme');
      if (saved) return saved === 'dark';
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return false;
  });

  useEffect(() => {
    const html = document.documentElement;
    if (isDark) {
      html.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      html.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [isDark]);

  return (
    <div className="relative min-h-screen bg-zinc-50 dark:bg-zinc-950 font-sans transition-colors duration-200">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,#e4e4e7_1px,transparent_1px),linear-gradient(to_bottom,#e4e4e7_1px,transparent_1px)] bg-[size:14px_14px] dark:hidden" />
      <div className="pointer-events-none absolute inset-0 hidden dark:block bg-[linear-gradient(to_right,#27272a_1px,transparent_1px),linear-gradient(to_bottom,#27272a_1px,transparent_1px)] bg-[size:14px_14px]" />

      <div className="relative w-full">
        <AuthHeader isDark={isDark} toggleTheme={() => setIsDark(!isDark)} />
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-8 relative">
        {/* Back */}
        <button type="button" onClick={() => window.history.back()} className="inline-flex items-center text-sm font-medium text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-50 hover:underline transition-colors">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </button>

        {/* Document Header */}
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 p-6 shadow-sm space-y-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-900 dark:bg-zinc-100">
              <Scale className="w-5 h-5 text-white dark:text-zinc-900" />
            </span>
            <div>
              <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-50 leading-tight">End-User License Agreement</h1>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">Beacyn · Beacyn Labs</p>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            {[
              { label: 'Product', value: 'Beacyn' },
              { label: 'Developer', value: 'Beacyn Labs' },
              { label: 'Effective', value: 'April 25, 2026' },
              { label: 'Version', value: '1.0' },
            ].map(({ label, value }) => (
              <div key={label} className="rounded-lg bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-100 dark:border-zinc-700 px-3 py-2">
                <p className="text-zinc-400 dark:text-zinc-500 uppercase tracking-wider text-[10px] font-semibold">{label}</p>
                <p className="font-semibold text-zinc-800 dark:text-zinc-100 mt-0.5">{value}</p>
              </div>
            ))}
          </div>

          <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
            <strong>IMPORTANT — READ CAREFULLY:</strong> This End-User License Agreement ("Agreement") is a legally binding contract between you ("Licensee") and Beacyn Labs ("Licensor") governing your use of the Beacyn software platform. By downloading, installing, accessing, or using Beacyn in any form, you acknowledge that you have read, understood, and agree to be bound by all terms of this Agreement. If you do not agree, do not install or use the Software.
          </div>
        </div>

        {/* License Tiers Overview */}
        <div className="space-y-4">
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">License Tiers at a Glance</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <LicenseTierCard
              icon={GitBranch}
              tier="Community License"
              tag="Free"
              tagColor="bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-900"
              items={[
                'Self-hosted via Git, Docker, or Podman',
                'Free for individuals and small-to-medium businesses (SMBs)',
                'Full feature access on self-hosted deployments',
                'No usage fees or seat limits for qualifying entities',
              ]}
              footer="Qualifying SMBs: organizations with fewer than 250 employees and annual revenue below USD 50 million."
            />
            <LicenseTierCard
              icon={Building2}
              tier="Enterprise License"
              tag="Paid"
              tagColor="bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-900"
              items={[
                'Required for large enterprises (≥ 250 employees or ≥ USD 50M revenue)',
                'Includes priority support and SLA guarantees',
                'Custom deployment and integration assistance',
                'Contact Beacyn Labs for licensing terms',
              ]}
              footer="Enterprise use without a valid paid license is a material breach of this Agreement."
            />
            <LicenseTierCard
              icon={Globe}
              tier="SaaS License"
              tag="Paid"
              tagColor="bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/40 dark:text-violet-400 dark:border-violet-900"
              items={[
                'Beacyn hosted and managed by Beacyn Labs',
                'Subscription-based, tiered by usage',
                'Governed by separate SaaS Subscription Agreement',
                'Subject to additional Data Processing Addendum (DPA)',
              ]}
              footer="Using Beacyn as a managed service constitutes acceptance of the SaaS Subscription Agreement in addition to this EULA."
            />
          </div>
        </div>

        {/* Main Document */}
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 px-6 sm:px-8 py-8 shadow-sm space-y-8 text-sm leading-relaxed">

          {/* 1 */}
          <Section id="definitions" title="1. Definitions">
            <p>For the purposes of this Agreement, the following terms shall have the meanings set forth below:</p>
            <ul className="space-y-2 pl-4 list-none">
              {[
                ['"Software"', 'means the Beacyn enterprise infrastructure monitoring and observability platform, including all associated binaries, source code (where made available), container images, configuration files, scripts, documentation, and updates.'],
                ['"Licensor"', 'means Beacyn Labs, the exclusive owner and developer of the Software.'],
                ['"Licensee"', 'means the individual, organisation, or legal entity that accepts this Agreement and uses the Software.'],
                ['"Community License"', 'means the free, self-hosted license granted to individuals, SMBs, and open-source contributors under the terms of Section 3.'],
                ['"Enterprise License"', 'means the paid commercial license required by large enterprises as defined in Section 4.'],
                ['"SaaS License"', 'means a subscription-based license for accessing the Software as a hosted service operated by Beacyn Labs.'],
                ['"Modification"', 'means any alteration, adaptation, translation, derivative work, or combination of the Software or any portion thereof.'],
                ['"SMB"', 'means a small or medium-sized business with fewer than 250 employees and annual gross revenue below USD 50,000,000.'],
              ].map(([term, def]) => (
                <li key={term as string} className="flex gap-2">
                  <span className="font-semibold text-zinc-800 dark:text-zinc-200 shrink-0">{term}</span>
                  <span>{def}</span>
                </li>
              ))}
            </ul>
          </Section>

          {/* 2 */}
          <Section id="ownership" title="2. Ownership and Intellectual Property">
            <p>
              The Software and all worldwide copyrights, patents, trade secrets, trademarks, service marks, and all other intellectual property rights therein are and shall remain the exclusive property of Beacyn Labs. This Agreement does not convey to the Licensee any ownership interest in the Software, but only a limited right of use as expressly set forth herein.
            </p>
            <p>
              The Beacyn name, logo, and all associated marks are trademarks of Beacyn Labs. No right or license is granted to use any Beacyn trademark, trade name, service mark, or product name, except as expressly authorised in writing by Beacyn Labs.
            </p>
            <p>
              Where the Software incorporates open-source components, those components remain subject to their respective open-source licenses. In the event of conflict between such licenses and this Agreement, the open-source license shall prevail solely with respect to those components. A complete list of open-source components and their applicable licenses is provided in the <code className="bg-zinc-100 dark:bg-zinc-800 px-1 py-0.5 rounded text-xs font-mono">NOTICES</code> file distributed with the Software.
            </p>
          </Section>

          {/* 3 */}
          <Section id="community" title="3. Community License — Free Self-Hosted Use">
            <Sub title="3.1 Grant of License">
              <p>
                Subject to the terms of this Agreement, Beacyn Labs grants to the Licensee a non-exclusive, non-transferable, royalty-free license to install and use the Software solely for the Licensee's own internal purposes, provided all of the following conditions are met:
              </p>
              <ul className="list-disc pl-5 space-y-1">
                <li>The Software is deployed via the official Git repository, Docker image, or Podman image published by Beacyn Labs; and</li>
                <li>The Licensee qualifies as an individual or as an SMB as defined in Section 1; and</li>
                <li>The Software is operated entirely on infrastructure owned or leased by the Licensee (self-hosted); and</li>
                <li>No fee, subscription, or commercial consideration is charged to third parties for access to the Software or its output.</li>
              </ul>
            </Sub>
            <Sub title="3.2 Non-Commercial Provision">
              <p>
                The Community License is granted strictly for the Licensee's own operational use. The Licensee may not use the Community License to deliver monitoring-as-a-service, managed services, or any revenue-generating offering to third parties.
              </p>
            </Sub>
            <Sub title="3.3 No Large-Enterprise Use">
              <p>
                Organisations that meet or exceed the Enterprise threshold defined in Section 1 are not eligible for the Community License and must obtain an Enterprise License pursuant to Section 4 before any use of the Software.
              </p>
            </Sub>
          </Section>

          {/* 4 */}
          <Section id="enterprise" title="4. Enterprise License — Large-Organisation Use">
            <p>
              Any organisation that (a) employs 250 or more persons, or (b) has annual gross revenues of USD 50,000,000 or more, must obtain a valid Enterprise License from Beacyn Labs prior to deploying or using the Software in any capacity. Use of the Software without an Enterprise License by a qualifying large enterprise constitutes infringement of Beacyn Labs' intellectual property rights and a material breach of this Agreement.
            </p>
            <p>
              Enterprise Licenses are available via direct agreement with Beacyn Labs and include negotiated terms covering deployment scale, support levels, SLAs, and audit rights. To enquire, contact <a href="mailto:licensing@beacyn.io" className="text-indigo-600 dark:text-indigo-400 hover:underline">licensing@beacyn.io</a>.
            </p>
          </Section>

          {/* 5 */}
          <Section id="saas" title="5. SaaS License — Hosted Service">
            <p>
              Where the Licensee accesses the Software as a service hosted and operated by Beacyn Labs ("Beacyn Cloud"), such use is governed by the SaaS Subscription Agreement and, where applicable, a Data Processing Addendum entered into separately between the parties. In the event of conflict between this EULA and a SaaS Subscription Agreement, the SaaS Subscription Agreement shall prevail with respect to the hosted service.
            </p>
            <p>
              The SaaS offering is a paid subscription. Continued access is conditional upon timely payment of applicable subscription fees. Beacyn Labs reserves the right to suspend or terminate access upon non-payment after reasonable notice.
            </p>
          </Section>

          {/* 6 */}
          <Section id="restrictions" title="6. Restrictions and Prohibited Uses">
            <p>Except as expressly permitted under this Agreement or applicable law, the Licensee shall not, and shall not permit any third party to:</p>
            <ol className="list-none space-y-2 pl-0">
              {[
                ['(a)', 'Copy, modify, adapt, translate, create derivative works from, or otherwise alter the Software or any part thereof;'],
                ['(b)', 'Sublicense, sell, resell, rent, lease, transfer, distribute, assign, or otherwise make the Software available to any third party for commercial gain;'],
                ['(c)', 'Rebrand, white-label, or otherwise remove or replace Beacyn Labs\' identity, branding, copyright notices, or trademarks within the Software;'],
                ['(d)', 'Repurpose the Software as the foundation for a competing or alternative infrastructure monitoring product or service;'],
                ['(e)', 'Reverse-engineer, decompile, disassemble, or attempt to derive the source code of any compiled component of the Software, except to the extent expressly permitted by applicable law notwithstanding this limitation;'],
                ['(f)', 'Use the Software in any manner that violates applicable law or regulation, including data protection, export control, and sanctions laws;'],
                ['(g)', 'Remove, alter, or obscure any proprietary legends, copyright notices, or license terms included in or on the Software;'],
                ['(h)', 'Use the Software to build an automated system to extract data for the purpose of training or evaluating machine learning models for commercial redistribution, without prior written consent from Beacyn Labs.'],
              ].map(([code, text]) => (
                <li key={code as string} className="flex gap-2">
                  <span className="font-semibold text-zinc-700 dark:text-zinc-300 shrink-0">{code}</span>
                  <span>{text}</span>
                </li>
              ))}
            </ol>
          </Section>

          {/* 7 */}
          <Section id="contributions" title="7. Contributions and Open-Source Components">
            <p>
              Beacyn is a dual-licensed product comprising both proprietary and open-source components. The open-source components are made available under their respective licenses (see the <code className="bg-zinc-100 dark:bg-zinc-800 px-1 py-0.5 rounded text-xs font-mono">NOTICES</code> file). The proprietary components — including the core monitoring engine, AI observability layer, and enterprise management interfaces — are made available solely under this Agreement.
            </p>
            <p>
              If you submit a contribution (e.g., a bug fix or feature) to the Beacyn open-source repository, you grant Beacyn Labs a perpetual, worldwide, royalty-free, irrevocable licence to use, reproduce, modify, and distribute your contribution as part of the Software under any license Beacyn Labs deems appropriate, including proprietary licenses.
            </p>
          </Section>

          {/* 8 */}
          <Section id="updates" title="8. Updates and New Versions">
            <p>
              Beacyn Labs may, at its sole discretion, issue updates, patches, or new versions of the Software. Such updates may be provided free of charge to Community Licensees or may be subject to an upgraded license tier. Beacyn Labs reserves the right to change license terms for future versions, provided that such changes do not retroactively alter the terms applicable to a version already in use by a validly licensed Licensee without reasonable notice.
            </p>
          </Section>

          {/* 9 */}
          <Section id="telemetry" title="9. Telemetry and Data Collection">
            <Sub title="9.1 Self-Hosted Deployments">
              <p>
                When running under the Community License, the Software operates entirely within the Licensee's own infrastructure. No telemetry, monitoring data, or infrastructure metadata is transmitted to Beacyn Labs unless the Licensee explicitly enables optional, opt-in analytics. Beacyn Labs does not have access to the Licensee's monitored assets, credentials, or collected metrics in a self-hosted deployment.
              </p>
            </Sub>
            <Sub title="9.2 SaaS Deployments">
              <p>
                In a SaaS deployment, Beacyn Labs processes monitoring data on behalf of the Licensee in its capacity as a data processor. Such processing is governed by the Data Processing Addendum and the Privacy Policy available at <a href="https://beacyn.io/privacy" className="text-indigo-600 dark:text-indigo-400 hover:underline">beacyn.io/privacy</a>.
              </p>
            </Sub>
            <Sub title="9.3 Aggregate Usage Metrics">
              <p>
                Where the Licensee has opted in, the Software may transmit anonymised, aggregated usage statistics (e.g., feature adoption counts, error frequencies) to Beacyn Labs solely for the purpose of product improvement. No personally identifiable information or infrastructure secrets are included in such transmissions. The Licensee may opt out at any time via the application settings.
              </p>
            </Sub>
          </Section>

          {/* 10 */}
          <Section id="warranties" title="10. Disclaimer of Warranties">
            <p className="uppercase font-semibold text-zinc-700 dark:text-zinc-300 text-xs tracking-wide">
              THE SOFTWARE IS PROVIDED "AS IS" AND "AS AVAILABLE", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED.
            </p>
            <p>
              TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, BEACYN LABS EXPRESSLY DISCLAIMS ALL WARRANTIES, INCLUDING BUT NOT LIMITED TO: (i) ANY IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, TITLE, AND NON-INFRINGEMENT; (ii) THAT THE SOFTWARE WILL MEET THE LICENSEE'S REQUIREMENTS OR OPERATE UNINTERRUPTED, ERROR-FREE, OR SECURELY; (iii) THE ACCURACY, COMPLETENESS, OR RELIABILITY OF ANY DATA, ALERTS, OR OBSERVABILITY OUTPUTS GENERATED BY THE SOFTWARE.
            </p>
            <p>
              BEACYN LABS DOES NOT WARRANT THAT ANY DEFECTS WILL BE CORRECTED OR THAT THE SOFTWARE IS FREE OF VIRUSES OR OTHER HARMFUL COMPONENTS. THE LICENSEE ASSUMES FULL RESPONSIBILITY FOR SELECTING THE SOFTWARE AND FOR ALL RESULTS OBTAINED FROM ITS USE.
            </p>
          </Section>

          {/* 11 */}
          <Section id="liability" title="11. Limitation of Liability">
            <p>
              TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, IN NO EVENT SHALL BEACYN LABS, ITS DIRECTORS, EMPLOYEES, CONTRACTORS, OR AFFILIATES BE LIABLE FOR ANY:
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, PUNITIVE, OR CONSEQUENTIAL DAMAGES;</li>
              <li>LOSS OF PROFITS, REVENUE, DATA, BUSINESS OPPORTUNITIES, GOODWILL, OR ANTICIPATED SAVINGS;</li>
              <li>SERVICE INTERRUPTIONS, DOWNTIME, OR FAILURES OF THE MONITORED INFRASTRUCTURE;</li>
              <li>COSTS OF PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;</li>
            </ul>
            <p>
              EVEN IF BEACYN LABS HAS BEEN ADVISED OF THE POSSIBILITY OF SUCH DAMAGES AND REGARDLESS OF THE THEORY OF LIABILITY (CONTRACT, TORT, STRICT LIABILITY, OR OTHERWISE).
            </p>
            <p>
              WHERE LIABILITY CANNOT BE FULLY EXCLUDED BY LAW, BEACYN LABS' TOTAL AGGREGATE LIABILITY TO THE LICENSEE ARISING OUT OF OR IN CONNECTION WITH THIS AGREEMENT SHALL NOT EXCEED THE GREATER OF: (a) THE AMOUNT PAID BY THE LICENSEE TO BEACYN LABS IN THE TWELVE (12) MONTHS PRECEDING THE CLAIM; OR (b) USD 100 FOR COMMUNITY LICENSEES WHO HAVE MADE NO PAYMENT.
            </p>
          </Section>

          {/* 12 */}
          <Section id="indemnity" title="12. Indemnification">
            <p>
              The Licensee agrees to indemnify, defend, and hold harmless Beacyn Labs and its officers, directors, employees, agents, and successors from and against any claims, losses, liabilities, damages, costs, and expenses (including reasonable legal fees) arising out of or relating to: (a) the Licensee's use of the Software in violation of this Agreement; (b) the Licensee's breach of any representation, warranty, or obligation under this Agreement; or (c) any claim that the Licensee's use of the Software infringes a third party's rights.
            </p>
          </Section>

          {/* 13 */}
          <Section id="termination" title="13. Term and Termination">
            <p>
              This Agreement is effective from the date the Licensee first downloads, accesses, or uses the Software and continues until terminated.
            </p>
            <p>
              Beacyn Labs may terminate this Agreement immediately upon written notice if the Licensee materially breaches any provision of this Agreement and fails to cure such breach within thirty (30) days of receipt of written notice. Beacyn Labs may also terminate this Agreement immediately, without notice, in cases of: (a) unlicensed commercial redistribution; (b) rebranding or misrepresentation of the Software; or (c) any use that infringes Beacyn Labs' intellectual property rights.
            </p>
            <p>
              Upon termination, all licenses granted hereunder cease immediately, and the Licensee must promptly destroy all copies of the Software in its possession or control. Sections 2, 6, 10, 11, 12, 14, and 15 survive termination.
            </p>
          </Section>

          {/* 14 */}
          <Section id="governing" title="14. Governing Law and Dispute Resolution">
            <p>
              This Agreement shall be governed by and construed in accordance with the laws of India, without regard to its conflict-of-law provisions. The parties irrevocably submit to the exclusive jurisdiction of the courts of competent jurisdiction in India for the resolution of any dispute arising out of or in connection with this Agreement.
            </p>
            <p>
              Before initiating any formal proceedings, the parties agree to attempt to resolve disputes in good faith through senior management escalation for a period of thirty (30) days.
            </p>
          </Section>

          {/* 15 */}
          <Section id="general" title="15. General Provisions">
            <Sub title="15.1 Entire Agreement">
              <p>This Agreement, together with any applicable Enterprise License agreement or SaaS Subscription Agreement, constitutes the entire agreement between the parties regarding the Software and supersedes all prior understandings.</p>
            </Sub>
            <Sub title="15.2 Severability">
              <p>If any provision of this Agreement is found invalid or unenforceable, that provision shall be modified to the minimum extent necessary to make it enforceable, and the remaining provisions shall continue in full force.</p>
            </Sub>
            <Sub title="15.3 Waiver">
              <p>No waiver of any provision shall be effective unless in writing. Failure by Beacyn Labs to enforce any right under this Agreement shall not constitute a waiver of that right.</p>
            </Sub>
            <Sub title="15.4 Assignment">
              <p>The Licensee may not assign or transfer this Agreement or any rights or obligations hereunder without the prior written consent of Beacyn Labs. Beacyn Labs may assign this Agreement freely, including in connection with a merger, acquisition, or sale of assets.</p>
            </Sub>
            <Sub title="15.5 Export Compliance">
              <p>The Licensee agrees to comply with all applicable export control laws and regulations. The Software may not be used, exported, or re-exported in violation of such laws, including to sanctioned countries or parties.</p>
            </Sub>
            <Sub title="15.6 Amendments">
              <p>Beacyn Labs reserves the right to update this Agreement at any time. Continued use of the Software following notice of material changes constitutes acceptance of the revised terms. Beacyn Labs will publish the current version at <a href="https://beacyn.io/legal/eula" className="text-indigo-600 dark:text-indigo-400 hover:underline">beacyn.io/legal/eula</a>.</p>
            </Sub>
          </Section>

          {/* 16 */}
          <Section id="contact" title="16. Contact Information">
            <p>For licensing enquiries, legal notices, or compliance questions, please contact:</p>
            <div className="rounded-lg bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-100 dark:border-zinc-700 px-5 py-4 space-y-1 text-sm font-mono">
              <p className="font-semibold text-zinc-800 dark:text-zinc-100 not-italic font-sans">Beacyn Labs</p>
              <p><span className="text-zinc-400">Licensing: </span><a href="mailto:licensing@beacyn.io" className="text-indigo-600 dark:text-indigo-400 hover:underline">licensing@beacyn.io</a></p>
              <p><span className="text-zinc-400">Legal: </span><a href="mailto:legal@beacyn.io" className="text-indigo-600 dark:text-indigo-400 hover:underline">legal@beacyn.io</a></p>
              <p><span className="text-zinc-400">Support: </span><a href="mailto:support@beacyn.io" className="text-indigo-600 dark:text-indigo-400 hover:underline">support@beacyn.io</a></p>
              <p><span className="text-zinc-400">Website: </span><a href="https://beacyn.io" className="text-indigo-600 dark:text-indigo-400 hover:underline">https://beacyn.io</a></p>
            </div>
          </Section>

        </div>

        {/* Footer note */}
        <div className="flex items-start gap-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 px-5 py-4 text-sm text-zinc-500 dark:text-zinc-400 shadow-sm">
          <ShieldCheck className="w-4 h-4 mt-0.5 shrink-0 text-zinc-400" />
          <p>
            By using Beacyn, you confirm that you have read and accepted this Agreement. If you are accepting on behalf of an organisation, you represent that you have the authority to bind that organisation to these terms. Last updated: <span className="font-medium text-zinc-700 dark:text-zinc-300">April 25, 2026</span>.
          </p>
        </div>

        {/* Quick nav */}
        <nav className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-400 dark:text-zinc-500 pb-8">
          {[
            ['#definitions', 'Definitions'],
            ['#ownership', 'Ownership'],
            ['#community', 'Community License'],
            ['#enterprise', 'Enterprise License'],
            ['#saas', 'SaaS License'],
            ['#restrictions', 'Restrictions'],
            ['#contributions', 'Contributions'],
            ['#updates', 'Updates'],
            ['#telemetry', 'Telemetry'],
            ['#warranties', 'Warranties'],
            ['#liability', 'Liability'],
            ['#termination', 'Termination'],
            ['#governing', 'Governing Law'],
            ['#contact', 'Contact'],
          ].map(([href, label]) => (
            <a key={href} href={href} className="hover:text-zinc-700 dark:hover:text-zinc-200 hover:underline transition-colors">{label}</a>
          ))}
        </nav>
      </div>
    </div>
  );
}
