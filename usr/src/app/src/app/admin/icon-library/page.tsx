// src/app/admin/icon-library/page.tsx
'use client';

import {
  Activity, AlertTriangle, ArrowLeft, ArrowRight, Archive, ArchiveRestore, BarChart3, Binary, Building,
  Bug, Calendar, CalendarClock, CalendarDays, CalendarIcon, CalendarX, Check, CheckCircle, CheckSquare,
  ChevronDown, ChevronsUpDown, ClipboardCheck, Clock, Copy, CreditCard, Crosshair, Dumbbell, Edit, Edit3,
  ExternalLink, FileText, Filter, Gamepad2, Globe, Hourglass, Image as ImageIcon, Info, Key, Layers, Leaf,
  Link2, ListChecks, ListFilter, ListOrdered, Loader2, LogIn, LogOut, Mail, Map as MapIconLucide, MapPin,
  MapPinned, Menu, MessageSquare, Palette, Phone, PlusCircle, Save, Search, Shield, ShieldAlert,
  ShieldCheck, ShieldPlus, Square, Star, Target, Terminal, Trash2, TrendingUp, Trophy, Upload, UploadCloud,
  User, UserCheck, UserCog, UserPlus, UserSquare2, Users, Users2, UserX, X, XCircle,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AuthProviderClientComponent } from '@/components/auth-provider-client-component';
import { PERMISSIONS } from '@/lib/permissions-master-list';

// Custom SVG Icons
const CricketBatModernIcon = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M19.5 13.5L10.5 4.5"/>
      <path d="m14.121 18.364-4.242-4.242 8.485-8.485 4.243 4.242-8.486 8.485z"/>
    </svg>
);

const CricketBatAndBallIcon = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
        <path d="M13.42 16.33a4.5 4.5 0 1 1-6.36-6.36" />
        <path d="M16.5 20.5 18 22" />
        <path d="m12.37 15.32 1.41 1.41" />
        <path d="M14.04 11.2a2.5 2.5 0 0 1 3.54-3.54l1.41 1.41-3.54 3.54-1.41-1.41Z" />
        <path d="m11.2 14.04 1.41 1.41-3.54 3.54-1.41-1.41 3.54-3.54Z" />
        <circle cx="6.5" cy="6.5" r="1.5" />
    </svg>
);

const CricketBallIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <circle cx="12" cy="12" r="10" />
    <path d="M8 3 Q 3 12, 8 21" />
    <path d="M10.5 3 Q 5.5 12, 10.5 21" strokeDasharray="2 2" />
    <path d="M13.5 3 Q 8.5 12, 13.5 21" strokeDasharray="2 2" />
    <path d="M16 3 Q 11 12, 16 21" />
  </svg>
);

const WicketKeeperGlovesAndBallIcon = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
        <circle cx="12" cy="7" r="2.5" />
        <path d="M8 21v-5.5a3 3 0 0 0-3-3v0a3 3 0 0 0-3 3V21h6z" />
        <path d="M4 15.5h4" />
        <path d="M5 12.5V11" />
        <path d="M6.5 12.5V11" />
        <path d="M8 12.5V11" />
        <path d="M16 21v-5.5a3 3 0 0 1 3-3v0a3 3 0 0 1 3 3V21h-6z" />
        <path d="M20 15.5h-4" />
        <path d="M19 12.5V11" />
        <path d="M17.5 12.5V11" />
        <path d="M16 12.5V11" />
    </svg>
);

const StumpsAndBallIcon = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
        <line x1="9" y1="20" x2="9" y2="8" />
        <line x1="12" y1="20" x2="12" y2="8" />
        <line x1="15" y1="20" x2="15" y2="8" />
        <path d="M8.5 8h3" />
        <path d="M12.5 8h3" />
        <circle cx="6" cy="18" r="2" />
    </svg>
);

const WicketKeeperGloveIcon = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
        <path d="M4 11V8a2 2 0 012-2h12a2 2 0 012 2v3" />
        <path d="M3 11h18v8a2 2 0 01-2 2H5a2 2 0 01-2-2v-8z" />
        <path d="M9 11v11" />
        <path d="M15 11v11" />
    </svg>
);

const StumpsBailsFlyingIcon = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
        <line x1="9" y1="20" x2="9" y2="8" />
        <line x1="12" y1="20" x2="12" y2="8" />
        <line x1="15" y1="20" x2="15" y2="8" />
        <path d="M7.5 7.5 C 6 6, 5 4, 3 3" />
        <path d="M16.5 7.5 C 18 6, 19 4, 21 3" />
    </svg>
);

const GoogleIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="24px" height="24px" className={className}>
    <path fill="#FFC107" d="M43.611,20.083H42V20H24v8h11.303c-1.649,4.657-6.08,8-11.303,8c-6.627,0-12-5.373-12-12c0-6.627,5.373-12,12-12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C12.955,4,4,12.955,4,24c0,11.045,8.955,20,20,20c11.045,0,20-8.955,20-20C44,22.659,43.862,21.35,43.611,20.083z" />
    <path fill="#FF3D00" d="M6.306,14.691l6.571,4.819C14.655,15.108,18.961,12,24,12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C16.318,4,9.656,8.337,6.306,14.691z" />
    <path fill="#4CAF50" d="M24,44c5.166,0,9.86-1.977,13.409-5.192l-6.19-5.238C29.211,35.091,26.715,36,24,36c-5.202,0-9.619-3.317-11.283-7.946l-6.522,5.025C9.505,39.556,16.227,44,24,44z" />
    <path fill="#1976D2" d="M43.611,20.083H42V20H24v8h11.303c-0.792,2.237-2.231,4.166-4.087,5.574l6.19,5.238C39.978,36.218,44,30.742,44,24C44,22.659,43.862,21.35,43.611,20.083z" />
  </svg>
);


const allIcons = {
  'Lucide Icons': [
    { name: 'Activity', Icon: Activity }, { name: 'AlertTriangle', Icon: AlertTriangle }, { name: 'ArrowLeft', Icon: ArrowLeft },
    { name: 'ArrowRight', Icon: ArrowRight }, { name: 'Archive', Icon: Archive }, { name: 'ArchiveRestore', Icon: ArchiveRestore },
    { name: 'BarChart3', Icon: BarChart3 }, { name: 'Binary', Icon: Binary }, { name: 'Building', Icon: Building },
    { name: 'Bug', Icon: Bug }, { name: 'Calendar', Icon: Calendar }, { name: 'CalendarClock', Icon: CalendarClock },
    { name: 'CalendarDays', Icon: CalendarDays }, { name: 'CalendarIcon', Icon: CalendarIcon }, { name: 'CalendarX', Icon: CalendarX },
    { name: 'Check', Icon: Check }, { name: 'CheckCircle', Icon: CheckCircle }, { name: 'CheckSquare', Icon: CheckSquare },
    { name: 'ChevronDown', Icon: ChevronDown }, { name: 'ChevronsUpDown', Icon: ChevronsUpDown }, { name: 'ClipboardCheck', Icon: ClipboardCheck },
    { name: 'Clock', Icon: Clock }, { name: 'Copy', Icon: Copy }, { name: 'CreditCard', Icon: CreditCard },
    { name: 'Crosshair', Icon: Crosshair }, { name: 'Dumbbell', Icon: Dumbbell }, { name: 'Edit', Icon: Edit },
    { name: 'Edit3', Icon: Edit3 }, { name: 'ExternalLink', Icon: ExternalLink }, { name: 'FileText', Icon: FileText },
    { name: 'Filter', Icon: Filter }, { name: 'Gamepad2', Icon: Gamepad2 }, { name: 'Globe', Icon: Globe },
    { name: 'Hourglass', Icon: Hourglass }, { name: 'ImageIcon', Icon: ImageIcon }, { name: 'Info', Icon: Info },
    { name: 'Key', Icon: Key }, { name: 'Layers', Icon: Layers }, { name: 'Leaf', Icon: Leaf },
    { name: 'Link2', Icon: Link2 }, { name: 'ListChecks', Icon: ListChecks }, { name: 'ListFilter', Icon: ListFilter },
    { name: 'ListOrdered', Icon: ListOrdered }, { name: 'Loader2', Icon: Loader2 }, { name: 'LogIn', Icon: LogIn },
    { name: 'LogOut', Icon: LogOut }, { name: 'Mail', Icon: Mail }, { name: 'MapIconLucide', Icon: MapIconLucide },
    { name: 'MapPin', Icon: MapPin }, { name: 'MapPinned', Icon: MapPinned }, { name: 'Menu', Icon: Menu },
    { name: 'MessageSquare', Icon: MessageSquare }, { name: 'Palette', Icon: Palette }, { name: 'Phone', Icon: Phone },
    { name: 'PlusCircle', Icon: PlusCircle }, { name: 'Save', Icon: Save }, { name: 'Search', Icon: Search },
    { name: 'Shield', Icon: Shield }, { name: 'ShieldAlert', Icon: ShieldAlert }, { name: 'ShieldCheck', Icon: ShieldCheck },
    { name: 'ShieldPlus', Icon: ShieldPlus }, { name: 'Square', Icon: Square }, { name: 'Star', Icon: Star },
    { name: 'Target', Icon: Target }, { name: 'Terminal', Icon: Terminal }, { name: 'Trash2', Icon: Trash2 },
    { name: 'TrendingUp', Icon: TrendingUp }, { name: 'Trophy', Icon: Trophy }, { name: 'Upload', Icon: Upload },
    { name: 'UploadCloud', Icon: UploadCloud }, { name: 'User', Icon: User }, { name: 'UserCheck', Icon: UserCheck },
    { name: 'UserCog', Icon: UserCog }, { name: 'UserPlus', Icon: UserPlus }, { name: 'UserSquare2', Icon: UserSquare2 },
    { name: 'Users', Icon: Users }, { name: 'Users2', Icon: Users2 }, { name: 'UserX', Icon: UserX },
    { name: 'X', Icon: X }, { name: 'XCircle', Icon: XCircle },
  ],
  'Custom SVG Icons': [
    { name: 'CricketBatModernIcon', Icon: CricketBatModernIcon },
    { name: 'CricketBatAndBallIcon', Icon: CricketBatAndBallIcon },
    { name: 'CricketBallIcon', Icon: CricketBallIcon },
    { name: 'WicketKeeperGlovesAndBallIcon', Icon: WicketKeeperGlovesAndBallIcon },
    { name: 'StumpsAndBallIcon', Icon: StumpsAndBallIcon },
    { name: 'WicketKeeperGloveIcon', Icon: WicketKeeperGloveIcon },
    { name: 'StumpsBailsFlyingIcon', Icon: StumpsBailsFlyingIcon },
    { name: 'GoogleIcon', Icon: GoogleIcon },
  ],
};

const IconDisplayCard: React.FC<{ name: string; Icon: React.ElementType }> = ({ name, Icon }) => (
  <div className="flex flex-col items-center justify-center gap-2 rounded-lg border bg-card p-4 text-card-foreground shadow-sm">
    <Icon className="h-8 w-8 text-primary" />
    <code className="text-xs text-muted-foreground">{name}</code>
  </div>
);

export default function IconLibraryPage() {
  return (
    <AuthProviderClientComponent
      requiredPermission={PERMISSIONS.PAGE_VIEW_ADMIN_ICON_LIBRARY}
      FallbackComponent={
        <div className="max-w-2xl mx-auto">
          <Card>
            <CardHeader><CardTitle>Access Denied</CardTitle></CardHeader>
            <CardContent><p>You do not have permission to view the icon library.</p></CardContent>
          </Card>
        </div>
      }
    >
      <div className="space-y-8">
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl font-headline text-primary">Icon Library</CardTitle>
            <CardDescription>A visual reference of all icons used in this project.</CardDescription>
          </CardHeader>
        </Card>

        {Object.entries(allIcons).map(([category, icons]) => (
          <Card key={category}>
            <CardHeader>
              <CardTitle>{category}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                {icons.map(({ name, Icon }) => (
                  <IconDisplayCard key={name} name={name} Icon={Icon} />
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
    </div>
  </AuthProviderClientComponent>
  );
}
