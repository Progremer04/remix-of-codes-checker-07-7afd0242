import { useState, useEffect, useRef } from 'react';
import { 
  MessageCircle, Send, X, Minimize2, Maximize2, 
  Loader2, User, Shield
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ref, push, set, onValue, serverTimestamp } from 'firebase/database';
import { database } from '@/integrations/firebase/config';
import { useFirebaseAuth } from '@/hooks/useFirebaseAuth';
import { format } from 'date-fns';

interface Message {
  id: string;
  senderId: string;
  senderName: string;
  isAdmin: boolean;
  text: string;
  createdAt: number;
}

interface ChatRoom {
  id: string;
  userName: string;
  userEmail: string;
  lastMessage: string;
  lastMessageAt: number;
  unreadAdmin: number;
  unreadUser: number;
}

export function LiveChat() {
  const { user, userData, isAdmin } = useFirebaseAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [chatRooms, setChatRooms] = useState<ChatRoom[]>([]);
  const [selectedRoom, setSelectedRoom] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Get room ID for regular users
  const userRoomId = user?.uid || null;

  // Subscribe to chat rooms (for admin) or messages (for users)
  useEffect(() => {
    if (!user) return;

    if (isAdmin) {
      // Admin: Subscribe to all chat rooms
      const roomsRef = ref(database, 'chatRooms');
      const unsubscribe = onValue(roomsRef, (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.val();
          const roomsList: ChatRoom[] = [];
          
          for (const [id, room] of Object.entries(data)) {
            const roomData = room as any;
            roomsList.push({
              id,
              userName: roomData.userName || 'Unknown',
              userEmail: roomData.userEmail || '',
              lastMessage: roomData.lastMessage || '',
              lastMessageAt: roomData.lastMessageAt || 0,
              unreadAdmin: roomData.unreadAdmin || 0,
              unreadUser: roomData.unreadUser || 0,
            });
          }
          
          setChatRooms(roomsList.sort((a, b) => b.lastMessageAt - a.lastMessageAt));
          
          // Calculate total unread
          const totalUnread = roomsList.reduce((sum, r) => sum + r.unreadAdmin, 0);
          setUnreadCount(totalUnread);
        }
      });

      return () => unsubscribe();
    } else {
      // User: Subscribe to their own chat room
      const messagesRef = ref(database, `chatMessages/${userRoomId}`);
      const unsubscribe = onValue(messagesRef, (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.val();
          const messagesList: Message[] = Object.entries(data).map(([id, msg]) => ({
            id,
            ...(msg as any)
          })).sort((a, b) => a.createdAt - b.createdAt);
          
          setMessages(messagesList);
        } else {
          setMessages([]);
        }
      });

      // Subscribe to unread count
      const roomRef = ref(database, `chatRooms/${userRoomId}/unreadUser`);
      onValue(roomRef, (snapshot) => {
        setUnreadCount(snapshot.val() || 0);
      });

      return () => unsubscribe();
    }
  }, [user, isAdmin, userRoomId]);

  // Subscribe to selected room messages (for admin)
  useEffect(() => {
    if (!isAdmin || !selectedRoom) return;

    const messagesRef = ref(database, `chatMessages/${selectedRoom}`);
    const unsubscribe = onValue(messagesRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        const messagesList: Message[] = Object.entries(data).map(([id, msg]) => ({
          id,
          ...(msg as any)
        })).sort((a, b) => a.createdAt - b.createdAt);
        
        setMessages(messagesList);
      } else {
        setMessages([]);
      }
    });

    // Mark as read
    set(ref(database, `chatRooms/${selectedRoom}/unreadAdmin`), 0);

    return () => unsubscribe();
  }, [isAdmin, selectedRoom]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Mark messages as read when opened
  useEffect(() => {
    if (isOpen && !isAdmin && userRoomId) {
      set(ref(database, `chatRooms/${userRoomId}/unreadUser`), 0);
    }
  }, [isOpen, isAdmin, userRoomId]);

  const sendMessage = async () => {
    if (!message.trim() || !user) return;

    setIsSending(true);
    try {
      const roomId = isAdmin && selectedRoom ? selectedRoom : userRoomId;
      if (!roomId) return;

      const messageData = {
        senderId: user.uid,
        senderName: userData?.displayName || user.email || 'User',
        isAdmin,
        text: message.trim(),
        createdAt: Date.now()
      };

      // Add message
      const messagesRef = ref(database, `chatMessages/${roomId}`);
      await push(messagesRef, messageData);

      // Update room info
      const roomUpdate: any = {
        lastMessage: message.trim(),
        lastMessageAt: Date.now(),
      };

      if (!isAdmin) {
        roomUpdate.userName = userData?.displayName || user.email?.split('@')[0] || 'User';
        roomUpdate.userEmail = user.email || '';
        roomUpdate.userId = user.uid;
      }

      // Increment unread count for the other party
      if (isAdmin) {
        const roomRef = ref(database, `chatRooms/${roomId}`);
        const snapshot = await new Promise<any>((resolve) => {
          onValue(roomRef, resolve, { onlyOnce: true });
        });
        const currentUnread = snapshot.val()?.unreadUser || 0;
        roomUpdate.unreadUser = currentUnread + 1;
      } else {
        roomUpdate.unreadAdmin = (await new Promise<any>((resolve) => {
          onValue(ref(database, `chatRooms/${roomId}/unreadAdmin`), resolve, { onlyOnce: true });
        })).val() + 1 || 1;
      }

      await set(ref(database, `chatRooms/${roomId}`), {
        ...(await new Promise<any>((resolve) => {
          onValue(ref(database, `chatRooms/${roomId}`), resolve, { onlyOnce: true });
        })).val(),
        ...roomUpdate
      });

      setMessage('');
    } catch (error) {
      console.error('Send message error:', error);
    }
    setIsSending(false);
  };

  if (!user) return null;

  return (
    <>
      {/* Chat Button */}
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-4 right-4 z-50 w-14 h-14 bg-primary text-primary-foreground rounded-full shadow-lg flex items-center justify-center hover:scale-110 transition-transform"
      >
        <MessageCircle className="w-6 h-6" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-destructive text-destructive-foreground rounded-full text-xs flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Chat Window */}
      {isOpen && (
        <div 
          className={`fixed z-50 bg-background border rounded-xl shadow-2xl flex flex-col transition-all ${
            isMinimized 
              ? 'bottom-4 right-4 w-72 h-12' 
              : 'bottom-4 right-4 w-80 sm:w-96 h-[500px]'
          }`}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-3 border-b bg-primary/10 rounded-t-xl">
            <div className="flex items-center gap-2">
              <MessageCircle className="w-5 h-5 text-primary" />
              <span className="font-medium">
                {isAdmin 
                  ? (selectedRoom 
                    ? chatRooms.find(r => r.id === selectedRoom)?.userName || 'Chat'
                    : 'Support Chats')
                  : 'Chat with Admin'}
              </span>
            </div>
            <div className="flex items-center gap-1">
              {isAdmin && selectedRoom && (
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setSelectedRoom(null)}>
                  ←
                </Button>
              )}
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setIsMinimized(!isMinimized)}>
                {isMinimized ? <Maximize2 className="w-4 h-4" /> : <Minimize2 className="w-4 h-4" />}
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setIsOpen(false)}>
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {!isMinimized && (
            <>
              {/* Chat Rooms List (Admin only) */}
              {isAdmin && !selectedRoom && (
                <ScrollArea className="flex-1 p-2">
                  {chatRooms.length === 0 ? (
                    <p className="text-center text-muted-foreground py-8">No active chats</p>
                  ) : (
                    <div className="space-y-2">
                      {chatRooms.map(room => (
                        <button
                          key={room.id}
                          onClick={() => setSelectedRoom(room.id)}
                          className="w-full p-3 rounded-lg hover:bg-accent text-left relative"
                        >
                          <div className="flex items-center gap-2">
                            <User className="w-8 h-8 p-1.5 bg-primary/20 rounded-full" />
                            <div className="flex-1 min-w-0">
                              <div className="font-medium truncate">{room.userName}</div>
                              <div className="text-xs text-muted-foreground truncate">{room.lastMessage}</div>
                            </div>
                            {room.unreadAdmin > 0 && (
                              <span className="w-5 h-5 bg-primary text-primary-foreground rounded-full text-xs flex items-center justify-center">
                                {room.unreadAdmin}
                              </span>
                            )}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              )}

              {/* Messages */}
              {(!isAdmin || selectedRoom) && (
                <>
                  <ScrollArea className="flex-1 p-4" ref={scrollRef}>
                    {messages.length === 0 ? (
                      <p className="text-center text-muted-foreground py-8">
                        {isAdmin ? 'No messages yet' : 'Send a message to start the conversation!'}
                      </p>
                    ) : (
                      <div className="space-y-3">
                        {messages.map(msg => (
                          <div
                            key={msg.id}
                            className={`flex ${msg.senderId === user.uid ? 'justify-end' : 'justify-start'}`}
                          >
                            <div className={`max-w-[80%] ${msg.senderId === user.uid ? 'order-2' : ''}`}>
                              <div className="flex items-center gap-1 mb-1">
                                {msg.isAdmin && <Shield className="w-3 h-3 text-primary" />}
                                <span className="text-xs text-muted-foreground">
                                  {msg.senderName}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                  {format(msg.createdAt, 'HH:mm')}
                                </span>
                              </div>
                              <div 
                                className={`p-3 rounded-lg ${
                                  msg.senderId === user.uid 
                                    ? 'bg-primary text-primary-foreground' 
                                    : 'bg-accent'
                                }`}
                              >
                                {msg.text}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </ScrollArea>

                  {/* Input */}
                  <div className="p-3 border-t">
                    <form 
                      onSubmit={(e) => { e.preventDefault(); sendMessage(); }}
                      className="flex items-center gap-2"
                    >
                      <Input
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        placeholder="Type a message..."
                        className="flex-1"
                        disabled={isSending}
                      />
                      <Button type="submit" size="icon" disabled={isSending || !message.trim()}>
                        {isSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                      </Button>
                    </form>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      )}
    </>
  );
}
