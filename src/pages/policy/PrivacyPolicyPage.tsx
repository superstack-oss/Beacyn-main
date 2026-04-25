import { useState, useEffect } from 'react';
import { ArrowLeft } from 'lucide-react';
import { AuthHeader } from '../../components/auth/AuthHeader';

export default function PrivacyPolicyPage() {
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
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50 mb-6">Beacyn Privacy Policy</h1>

          <div className="space-y-6">
            <p>
              We at Mackdev Inc. (together with our affiliates, "Beacyn", "we", "our", or "us") respect your privacy and are strongly committed to keeping secure any information we obtain from you or about you. This Privacy Policy describes our practices with respect to Personal Information we collect from or about you when you use our website, applications, and services (collectively, "Services").
            </p>

            <p>
              This Privacy Policy does not apply to the infrastructure telemetry, logs, uptime metrics, or status data that we process on behalf of customers of our business offerings. Our use of that infrastructure data is governed entirely by our customer agreements covering access to and use of those enterprise monitoring offerings.
            </p>

            <p className="font-medium text-zinc-900 dark:text-zinc-100">Effective: April 20, 2026</p>

            <p>
              We've updated our Privacy Policy below. These updates apply to all users of Beacyn Services. If you have any questions about these changes, please contact us at <a href="mailto:privacy@mackdev.com" className="text-indigo-600 dark:text-indigo-400 hover:underline">privacy@mackdev.com</a>.
            </p>

            <div className="h-px bg-zinc-200 dark:bg-zinc-800 my-8" />

            <section>
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50 mb-3">1. Personal Information We Collect</h2>
              <p className="mb-4">We collect personal information relating to you ("Personal Information") as follows:</p>

              <h3 className="font-medium text-zinc-800 dark:text-zinc-200 mb-2">Personal Information You Provide:</h3>
              <p className="mb-2">We collect Personal Information if you create an account to use our Services or communicate with us as follows:</p>
              <ul className="list-disc pl-5 space-y-2 mb-4">
                <li><strong>Account Information:</strong> When you create an account with us, we will collect information associated with your account, including your name, contact information, account credentials, payment card information, and transaction history.</li>
                <li><strong>Communication Information:</strong> If you communicate with us, we collect your name, contact information, and the contents of any messages you send.</li>
                <li><strong>Social Media Information:</strong> When you interact with our social media pages, we will collect Personal Information that you elect to provide to us, such as your contact details.</li>
              </ul>

              <h3 className="font-medium text-zinc-800 dark:text-zinc-200 mb-2 mt-4">Personal Information We Receive Automatically:</h3>
              <p className="mb-2">When you visit, use, or interact with the Services, we receive the following information about your visit, use, or interactions ("Technical Information"):</p>
              <ul className="list-disc pl-5 space-y-2">
                <li><strong>Log Data:</strong> Information that your browser or device automatically sends when you use our Services. Log data includes your Internet Protocol address, browser type and settings, the date and time of your request, and how you interact with our Services.</li>
                <li><strong>Usage Data:</strong> We may automatically collect information about your use of the Services, such as the features you use and the actions you take, as well as your time zone, country, the dates and times of access, user agent and version, type of computer or mobile device, and your computer connection.</li>
                <li><strong>Device Information:</strong> Includes name of the device, operating system, device identifiers, and browser you are using. Information collected may depend on the type of device you use and its settings.</li>
                <li><strong>Cookies & Analytics:</strong> We use cookies and similar online analytics products to operate, administer, and improve our Services, and analyze how users use our Services.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50 mb-3 mt-8">2. How We Use Personal Information</h2>
              <p className="mb-3">We may use Personal Information for the following purposes:</p>
              <ul className="list-disc pl-5 space-y-2 mb-4">
                <li>To provide, administer, maintain, and/or analyze the Services</li>
                <li>To improve our Services and conduct research</li>
                <li>To communicate with you, including to send you information about our Services and events</li>
                <li>To develop new programs and services</li>
                <li>To prevent fraud, criminal activity, or misuses of our Services, and to protect the security of our IT systems, architecture, and networks</li>
                <li>To comply with legal obligations and legal process and to protect our rights, privacy, safety, or property, and/or that of our affiliates, you, or other third parties</li>
              </ul>
              <h3 className="font-medium text-zinc-800 dark:text-zinc-200 mb-2">Aggregated or De-identified Information:</h3>
              <p>We may aggregate or de-identify Personal Information so that it may no longer be used to identify you and use such information to analyze the effectiveness of our Services, to improve and add features to our Services, to conduct research and for other similar purposes.</p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50 mb-3 mt-8">3. Disclosure of Personal Information</h2>
              <p className="mb-3">In certain circumstances, we may provide your Personal Information to third parties without further notice to you, unless required by the law:</p>
              <ul className="list-disc pl-5 space-y-2">
                <li><strong>Vendors and Service Providers:</strong> To assist us in meeting business operations needs and to perform certain services and functions, we may provide Personal Information to vendors and service providers, including providers of hosting services, customer service vendors, cloud services, email communication software, web analytics services, and other information technology providers.</li>
                <li><strong>Business Transfers:</strong> If we are involved in strategic transactions, reorganization, bankruptcy, receivership, or transition of service to another provider, your Personal Information and other information may be disclosed in the diligence process and transferred to a successor or affiliate as part of that Transaction.</li>
                <li><strong>Legal Requirements:</strong> We may share your Personal Information with government authorities, industry peers, or other third parties if required to do so by law or in the good faith belief that such action is necessary to comply with a legal obligation, protect our rights, or protect the safety of our products, employees, or users.</li>
                <li><strong>Business Account Administrators:</strong> When you join a Beacyn Enterprise or business account, the administrators of that account may access and control your Beacyn account.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50 mb-3 mt-8">4. Your Rights</h2>
              <p className="mb-3">Depending on location, individuals may have certain statutory rights in relation to their Personal Information. For example, you may have the right to access, delete, rectify, transfer, restrict, or object to the processing of your Personal Information, as well as lodge a complaint with your local data protection authority.</p>
              <p>You can exercise some of these rights through your Beacyn account. If you are unable to exercise your rights through your account, please submit your request to <a href="mailto:privacy@mackdev.com" className="text-indigo-600 dark:text-indigo-400 hover:underline">privacy@mackdev.com</a>.</p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50 mb-3 mt-8">5. Security and Retention</h2>
              <p>We implement commercially reasonable technical, administrative, and organizational measures to protect Personal Information both online and offline from loss, misuse, and unauthorized access, disclosure, alteration, or destruction. We'll retain your Personal Information for only as long as we need in order to provide our Service to you, or for other legitimate business purposes such as resolving disputes, safety and security reasons, or complying with our legal obligations.</p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50 mb-3 mt-8">6. International Users</h2>
              <p>By using our Service, you understand and acknowledge that your Personal Information will be processed and stored in our facilities and servers in the United States and may be disclosed to our service providers and affiliates in other jurisdictions.</p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50 mb-3 mt-8">7. Changes to the Privacy Policy</h2>
              <p>We may update this Privacy Policy from time to time. When we do, we will post an updated version on this page, unless another type of notice is required by applicable law.</p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50 mb-3 mt-8">8. Contact Information</h2>
              <p className="mb-2">If you have any questions about this Privacy Policy or our privacy practices, please contact us at:</p>
              <address className="not-italic text-zinc-800 dark:text-zinc-200 font-medium">
                Mackdev Inc.<br />
                Email: <a href="mailto:privacy@mackdev.com" className="text-indigo-600 dark:text-indigo-400 font-normal hover:underline">privacy@mackdev.com</a><br />
                Address: [Your Business Address]
              </address>
            </section>

          </div>
        </div>
      </div>
    </div>
  );
}
