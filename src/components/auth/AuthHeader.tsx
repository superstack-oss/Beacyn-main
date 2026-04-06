import { Globe, Moon, Sun, BookOpen, Hexagon, ChevronDown } from 'lucide-react';
import { Button } from '../ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu"

interface AuthHeaderProps {
  isDark: boolean;
  toggleTheme: () => void;
}

export function AuthHeader({ isDark, toggleTheme }: AuthHeaderProps) {
  return (
    <header className="w-full px-6 py-4 flex items-center justify-between bg-transparent">
      <div className="flex items-center gap-2 text-zinc-900 dark:text-white">
        <Hexagon className="w-7 h-7 text-zinc-900 dark:text-white fill-zinc-100 dark:fill-zinc-800" />
        <span className="font-bold text-xl tracking-tight">PulseIQ</span>
      </div>

      <div className="flex items-center gap-2 sm:gap-4">
        <Button variant="ghost" className="hidden sm:flex items-center gap-1.5 text-sm font-medium text-zinc-600 dark:text-zinc-400" asChild>
          <a href="#">
            <BookOpen className="w-4 h-4" />
            <span>Docs</span>
          </a>
        </Button>

        <div className="h-4 w-px bg-zinc-200 dark:bg-zinc-800 hidden sm:block"></div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="flex items-center gap-1 text-sm font-medium text-zinc-600 dark:text-zinc-400 px-2">
              <Globe className="w-4 h-4" />
              <span className="hidden sm:inline">EN</span>
              <ChevronDown className="w-3 h-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem>English</DropdownMenuItem>
            <DropdownMenuItem>Spanish</DropdownMenuItem>
            <DropdownMenuItem>French</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Button
          variant="ghost"
          size="icon"
          onClick={toggleTheme}
          className="text-zinc-600 dark:text-zinc-400"
          aria-label="Toggle theme"
        >
          {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </Button>
      </div>
    </header>
  );
}
