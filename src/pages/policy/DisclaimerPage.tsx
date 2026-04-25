import { useState, useEffect } from 'react';
import { ArrowLeft } from 'lucide-react';
import { AuthHeader } from '../../components/auth/AuthHeader';

export default function DisclaimerPage() {
  const [isDark, setIsDark] = useState(() => {
    if (typeof window !== 'undefined') {
      const savedTheme = localStorage.getItem('theme');
      if (savedTheme) {
        return savedTheme === 'dark';
      }
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

      <div className="relative items-end justify-end w-full">
        <AuthHeader isDark={isDark} toggleTheme={() => setIsDark(!isDark)} />
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-6 relative">
        <button type="button" onClick={() => window.history.back()} className="inline-flex items-center text-sm font-medium text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-50 hover:underline mb-2 transition-colors">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </button>

        <div className="rounded-xl bg-transparent text-sm text-zinc-600 dark:text-zinc-400">
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50 mb-6">Disclaimer</h1>

          <div className="space-y-6">
            <p className="font-semibold text-zinc-900 dark:text-zinc-100 uppercase tracking-wide">
              BEACYN LABS IS PROVIDED ON AN "AS IS" AND "AS AVAILABLE" BASIS. MACKDEV INC. DISCLAIMS ALL WARRANTIES, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO, ANY IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT.
            </p>

            <div className="h-px bg-zinc-200 dark:bg-zinc-800 my-8" />

            <section>
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50 mb-3">1. Telemetry and Data Accuracy</h2>
              <p>
                Beacyn relies upon third-party agents, SNMP probes, IP routing protocols, and proprietary APIs to aggregate infrastructure data. While we strive to present accurate telemetry and status updates, we do not guarantee that the metrics displayed are always 100% accurate, up-to-date, or free of latency. Infrastructure states change dynamically, and local network misconfigurations or agent failures can result in false positives or inaccurate node status reports.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50 mb-3 mt-8">2. Alerting and Notification Delays</h2>
              <p>
                The Beacyn platform is not a substitute for critical emergency monitoring systems. You acknowledge that alert notifications sent via email, SMS, or integrations like ServiceNow or Slack may be subject to delays beyond our control. Mackdev Inc. assumes no liability for missed critical incidents, hardware failures, or network down events resulting from delayed or undelivered platform notifications.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50 mb-3 mt-8">3. Configuration Responsibility</h2>
              <p>
                As an enterprise platform, the performance of Beacyn depends heavily on proper configuration by system administrators. You hold sole responsibility for appropriately provisioning your subnets, setting practical incident thresholds, and maintaining correct SNMP community strings. We are not liable for gaps in observability stemming from incorrect or incomplete configuration.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50 mb-3 mt-8">4. Zero-Downtime Guarantee Exception</h2>
              <p>
                While Mackdev Inc. targets maximal platform availability, we do not guarantee continuous, uninterrupted access to the Beacyn application interface or ingestion endpoints. Occasional scheduled maintenance windows and unexpected disruptions may occur. The platform must not be your sole point of failure for observing mission-critical workloads.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50 mb-3 mt-8">5. Liability Limitation</h2>
              <p>
                Under no circumstances shall Mackdev Inc. or its affiliates, partners, suppliers, or licensors be liable for any indirect, incidental, consequential, special, or exemplary damages arising out of or in connection with your access or use of or inability to access or use the application and any third party content and services, whether or not the company has been advised of the possibility of such damages.
              </p>
            </section>

          </div>
        </div>
      </div>
    </div>
  );
}
