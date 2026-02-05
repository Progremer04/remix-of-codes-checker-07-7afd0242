import { useState, useEffect } from 'react';
import { Bell, X, Check, Info, AlertTriangle, Gift, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ref, onValue, set, remove, push } from 'firebase/database';
import { database } from '@/integrations/firebase/config';
import { useFirebaseAuth } from '@/hooks/useFirebaseAuth';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';

export interface Notification {
  id: string;
  type: 'info' | 'success' | 'warning' | 'service' | 'admin';
  title: string;
  message: string;
  createdAt: number;
  read: boolean;
}

const NOTIFICATION_ICONS: Record<string, React.ReactNode> = {
  info: <Info className="w-4 h-4 text-blue-500" />,
  success: <Check className="w-4 h-4 text-success" />,
  warning: <AlertTriangle className="w-4 h-4 text-warning" />,
  service: <Gift className="w-4 h-4 text-primary" />,
  admin: <Shield className="w-4 h-4 text-primary" />,
};

export function NotificationBell() {
  const { user } = useFirebaseAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isOpen, setIsOpen] = useState(false);

  const unreadCount = notifications.filter(n => !n.read).length;

  useEffect(() => {
    if (!user) return;

    const notificationsRef = ref(database, `notifications/${user.uid}`);
    const unsubscribe = onValue(notificationsRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        const notificationsList: Notification[] = Object.entries(data)
          .map(([id, notif]) => ({
            id,
            ...(notif as any)
          }))
          .sort((a, b) => b.createdAt - a.createdAt);
        
        setNotifications(notificationsList);
        
        // Show toast for new unread notifications
        const newUnread = notificationsList.filter(n => !n.read && Date.now() - n.createdAt < 5000);
        newUnread.forEach(n => {
          toast(n.title, { description: n.message });
        });
      } else {
        setNotifications([]);
      }
    });

    return () => unsubscribe();
  }, [user]);

  const markAsRead = async (notificationId: string) => {
    if (!user) return;
    await set(ref(database, `notifications/${user.uid}/${notificationId}/read`), true);
  };

  const markAllAsRead = async () => {
    if (!user) return;
    
    const updates: Record<string, boolean> = {};
    notifications.forEach(n => {
      if (!n.read) {
        updates[`notifications/${user.uid}/${n.id}/read`] = true;
      }
    });
    
    for (const [path, value] of Object.entries(updates)) {
      await set(ref(database, path), value);
    }
  };

  const deleteNotification = async (notificationId: string) => {
    if (!user) return;
    await remove(ref(database, `notifications/${user.uid}/${notificationId}`));
  };

  const clearAll = async () => {
    if (!user) return;
    await remove(ref(database, `notifications/${user.uid}`));
  };

  if (!user) return null;

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="w-5 h-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 w-5 h-5 bg-destructive text-destructive-foreground rounded-full text-xs flex items-center justify-center">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="flex items-center justify-between p-3 border-b">
          <h4 className="font-semibold">Notifications</h4>
          {notifications.length > 0 && (
            <div className="flex gap-1">
              {unreadCount > 0 && (
                <Button variant="ghost" size="sm" onClick={markAllAsRead}>
                  Mark all read
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={clearAll}>
                Clear
              </Button>
            </div>
          )}
        </div>
        
        <ScrollArea className="max-h-96">
          {notifications.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No notifications</p>
          ) : (
            <div className="divide-y">
              {notifications.map(notification => (
                <div
                  key={notification.id}
                  className={`p-3 hover:bg-accent cursor-pointer relative group ${!notification.read ? 'bg-primary/5' : ''}`}
                  onClick={() => markAsRead(notification.id)}
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5">
                      {NOTIFICATION_ICONS[notification.type]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm">{notification.title}</div>
                      <div className="text-xs text-muted-foreground">{notification.message}</div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {formatDistanceToNow(notification.createdAt, { addSuffix: true })}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteNotification(notification.id);
                      }}
                    >
                      <X className="w-3 h-3" />
                    </Button>
                  </div>
                  {!notification.read && (
                    <div className="absolute right-3 top-3 w-2 h-2 bg-primary rounded-full" />
                  )}
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

// Helper function to send notifications (to be used from admin or server)
export async function sendNotification(
  userId: string, 
  notification: Omit<Notification, 'id' | 'createdAt' | 'read'>
) {
  const notificationsRef = ref(database, `notifications/${userId}`);
  await push(notificationsRef, {
    ...notification,
    createdAt: Date.now(),
    read: false
  });
}
