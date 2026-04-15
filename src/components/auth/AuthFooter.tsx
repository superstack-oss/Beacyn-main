export function AuthFooter() {
  return (
    <footer className="w-full px-6 py-4 bg-transparent mt-auto">
      <div className="max-w-8xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
        <p className="text-sm text-zinc-500 dark:text-zinc-400 text-center md:text-left">
          &copy; 2026 Mackdev Inc. All rights reserved.
        </p>
        <div className="flex flex-wrap justify-center items-center gap-x-6 gap-y-2">
          <a href="#" className="text-sm font-normal text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white hover:underline underline-offset-4 transition-colors">
            Privacy policy
          </a>
          <a href="#" className="text-sm font-normal text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white hover:underline underline-offset-4 transition-colors">
            Terms of Use
          </a>
          <a href="#" className="text-sm font-normal text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white hover:underline underline-offset-4 transition-colors">
            Disclaimer
          </a>
        </div>
      </div>
    </footer>
  );
}
