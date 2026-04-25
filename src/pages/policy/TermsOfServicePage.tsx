import { useState, useEffect } from 'react';
import { ArrowLeft } from 'lucide-react';
import { AuthHeader } from '../../components/auth/AuthHeader';

export default function TermsOfServicePage() {
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
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50 mb-6">Terms and Conditions</h1>

          <div className="space-y-6">
            <p>
              Welcome to Beacyn Labs, an enterprise infrastructure monitoring and observability platform operated by Mackdev Inc. ("Company," "we," "us," or "our"). We hope you enjoy the experience!
            </p>
            <p>
              These Terms and Conditions ("Terms") are a legal contract between you and Mackdev Inc. and govern your activity on Beacyn's websites, applications, monitoring agents, and other tools. All the text, data, information, software, graphics, logos, photographs, and more (all of which we refer to as "Materials") that Mackdev Inc. and its subsidiaries and affiliated companies may make available to you, as well as any solutions we may make available to you through any of our websites and other tools (all of which are referred to in these Terms as "Beacyn Tools").
            </p>
            <p className="font-semibold text-zinc-900 dark:text-zinc-100 uppercase tracking-wide">
              READ THESE TERMS CAREFULLY BEFORE ACCESSING, BROWSING, OR USING BEACYN TOOLS. ACCESSING, BROWSING, OR USING BEACYN TOOLS INDICATES THAT YOU HAVE BOTH READ AND ACCEPT THESE TERMS. YOU CANNOT ACCESS, BROWSE, OR USE BEACYN TOOLS IF YOU DO NOT ACCEPT THESE TERMS.
            </p>

            <div className="h-px bg-zinc-200 dark:bg-zinc-800 my-8" />

            <section>
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50 mb-3">1. Accessing Beacyn Tools</h2>
              <p className="mb-2">When you access Beacyn Tools, you are responsible for complying with these Terms as well as any and all use of Beacyn Tools through any account that you may set up. Some Materials will only be available to you if you have an account.</p>
              <p className="mb-2">You agree to provide true, accurate, current, and complete information for so long as you use Beacyn Tools. It is your responsibility to obtain and maintain all equipment, services and software needed for access to and use of Beacyn Tools. It is also your responsibility to maintain the confidentiality of your password(s).</p>
              <p>Sometimes, we collect certain personal information about you solely in connection with your access and use of Beacyn Tools. Mackdev Inc.'s use of that information is governed by the provisions of our Privacy Policy.</p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50 mb-3 mt-8">2. Your Permitted Use of Beacyn Tools</h2>
              <p className="mb-2">You are invited to use Beacyn Tools for your business purposes to monitor, manage, and observe your infrastructure layout. We hereby grant you a limited, personal, non-exclusive and non-transferable license during the authorized term to use and to display the Materials only in connection with these permitted uses.</p>
              <p>You have no other rights in Beacyn Tools or any Materials and you may not modify, edit, copy, reproduce, create derivative works of, reverse engineer, alter, enhance or in any way exploit any Beacyn Tools or Materials in any manner, unless it is authorized in writing by us.</p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50 mb-3 mt-8">3. Unauthorized Use of Beacyn Tools</h2>
              <p>We authorize your limited use of Beacyn Tools. Any other use of Beacyn Tools beyond the permitted uses is prohibited and constitutes unauthorized use. All rights in Beacyn Tools and Materials remain the property of Mackdev Inc., its subsidiaries, or its affiliated companies.</p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50 mb-3 mt-8">4. Acceptable Use Policy</h2>
              <p className="mb-3">You agree to use Beacyn Tools only for lawful purposes and in accordance with these Terms. You may not:</p>
              <ul className="list-disc pl-5 space-y-1">
                <li>Use the Service for any illegal or unauthorized purpose</li>
                <li>Upload or monitor content that violates intellectual property rights</li>
                <li>Attempt to gain unauthorized access to the Service or other users' accounts</li>
                <li>Interfere with or disrupt the Service or servers</li>
                <li>Use the Service to transmit malware, viruses, or harmful code</li>
                <li>Attempt to reverse engineer or decompile any software or monitoring agents</li>
                <li>Use the Service to monitor endpoints you do not own or have explicit authorization to monitor</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50 mb-3 mt-8">5. Terminating Your Use of Beacyn Tools</h2>
              <p>We or you may terminate your use of Beacyn Tools at any time. Your use of Beacyn Tools will automatically terminate in the event you breach any of these Terms. We may terminate, suspend, or modify your registration with, or access to, all or part of Beacyn Tools, without notice, at any time and for any reason.</p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50 mb-3 mt-8">6. Disclaimers</h2>
              <p className="font-semibold text-zinc-800 dark:text-zinc-200 mb-2">BEACYN TOOLS ARE PROVIDED "AS IS" AND "WITH ALL FAULTS" AND THE ENTIRE RISK AS TO THE QUALITY AND PERFORMANCE OF BEACYN TOOLS IS WITH YOU.</p>
              <p className="mb-2">Mackdev Inc. expressly disclaims all warranties of any kind (express, implied or statutory) with respect to Beacyn Tools, which includes but is not limited to, any implied or statutory warranties of merchantability, fitness for a particular use or purpose, title, and non-infringement of intellectual property rights.</p>
              <p>Mackdev Inc. does not promise you that Beacyn Tools will meet your requirements or that Beacyn Tools will be uninterrupted, timely, secure, or error free or that defects will be corrected.</p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50 mb-3 mt-8">7. Limitation of Liability</h2>
              <p className="font-semibold text-zinc-800 dark:text-zinc-200 uppercase text-[13px] leading-relaxed">
                IN NO EVENT WILL ANY OF THE MACKDEV INC. PARTIES BE LIABLE FOR (A) ANY INDIRECT, SPECIAL, CONSEQUENTIAL, PUNITIVE, OR EXEMPLARY DAMAGES OR (B) DAMAGES THAT ARE MORE THAN ONE HUNDRED UNITED STATES (US$100.00) DOLLARS IN TOTAL (INCLUDING, WITHOUT LIMITATION, THOSE RESULTING FROM LOSS OF REVENUES, LOST PROFITS, LOSS OF GOODWILL, LOSS OF USE, BUSINESS INTERRUPTION, OR OTHER INTANGIBLE LOSSES), ARISING OUT OF OR IN CONNECTION WITH BEACYN TOOLS, WHETHER SUCH DAMAGES ARE BASED ON WARRANTY, CONTRACT, TORT, STATUTE, OR ANY OTHER LEGAL THEORY.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50 mb-3 mt-8">8. Content, Telemetry, and Data</h2>
              <ul className="space-y-2">
                <li><strong className="text-zinc-800 dark:text-zinc-200">8.1 Data Ownership:</strong> You retain ownership of telemetry, logs, and infrastructure data you transmit to Beacyn. By using our Services, you grant us a limited license to process, analyze, and display your data to provide the Service.</li>
                <li><strong className="text-zinc-800 dark:text-zinc-200">8.2 Data Processing:</strong> We process your monitoring data in accordance with applicable data protection laws.</li>
                <li><strong className="text-zinc-800 dark:text-zinc-200">8.3 Data Security:</strong> We implement appropriate technical and organizational measures to protect your monitoring data, but no system is completely secure.</li>
                <li><strong className="text-zinc-800 dark:text-zinc-200">8.4 Data Retention:</strong> Your data is retained according to your plan's retention period and may be deleted upon account termination or data expiration.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50 mb-3 mt-8">9. Infrastructure Monitoring Accuracy</h2>
              <ul className="space-y-2">
                <li><strong className="text-zinc-800 dark:text-zinc-200">9.1 Telemetry Accuracy:</strong> Beacyn relies on agents, SNMP, web probes, and API endpoints to collect telemetry. While we strive for high accuracy and minimal latency, network conditions, agent configurations, and external factors may cause delays or inaccuracies in reported statuses or metrics.</li>
                <li><strong className="text-zinc-800 dark:text-zinc-200">9.2 Alerting Responsibility:</strong> You are responsible for configuring appropriate thresholds, alert rules, and incident response integrations. Mackdev Inc. is not liable for missed alerts, false positives, or the resulting impact on your business operations or service level agreements (SLAs).</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50 mb-3 mt-8">10. Intellectual Property Rights</h2>
              <ul className="space-y-2">
                <li><strong className="text-zinc-800 dark:text-zinc-200">10.1 Our Rights:</strong> Beacyn, including its software, agents, design, and content, is owned by Mackdev Inc. and protected by intellectual property laws.</li>
                <li><strong className="text-zinc-800 dark:text-zinc-200">10.2 License:</strong> We grant you a limited, non-exclusive, non-transferable license to use Beacyn and install its tracking agents in accordance with these Terms.</li>
                <li><strong className="text-zinc-800 dark:text-zinc-200">10.3 Closed Software License:</strong> Beacyn is a closed-source, proprietary software application. This software is not open source and cannot be used, modified, distributed, or reproduced without explicit written approval from Mackdev Inc.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50 mb-3 mt-8">11. Indemnification</h2>
              <p>You agree to indemnify, defend, and hold harmless Mackdev Inc. and its officers, directors, employees, and agents from and against any and all claims, liabilities, damages, losses, costs, expenses, or fees (including reasonable attorneys' fees) that such parties may incur as a result of or arising from your (or anyone using your account) violation of these Terms.</p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50 mb-3 mt-8">12. Governing Law</h2>
              <p>These Terms shall be governed by and construed in accordance with the laws of the jurisdiction where Mackdev Inc. is incorporated, without regard to conflict of law principles.</p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50 mb-3 mt-8">13. Entire Agreement</h2>
              <p>These Terms constitute the entire and exclusive and final statement of the agreement between you and Mackdev Inc. with respect to the subject matter hereof, superseding any prior agreements or negotiations.</p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50 mb-3 mt-8">14. Contact Information</h2>
              <p className="mb-2">If you have any questions about these Terms, please contact us at:</p>
              <address className="not-italic text-zinc-800 dark:text-zinc-200 font-medium">
                Mackdev Inc.<br />
                Email: <a href="mailto:legal@mackdev.com" className="text-indigo-600 dark:text-indigo-400 font-normal hover:underline">legal@mackdev.com</a><br />
                Address: [Your Business Address]
              </address>
            </section>

          </div>
        </div>
      </div>
    </div>
  );
}
