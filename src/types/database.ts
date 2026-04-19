export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          username: string;
          display_name: string | null;
          avatar_url: string | null;
          bio: string | null;
          website: string | null;
          is_artist: boolean;
          stripe_account_id: string | null;
          stripe_onboarded: boolean;
          followers_count: number;
          following_count: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          username: string;
          display_name?: string | null;
          avatar_url?: string | null;
          bio?: string | null;
          website?: string | null;
          is_artist?: boolean;
          stripe_account_id?: string | null;
          stripe_onboarded?: boolean;
          followers_count?: number;
          following_count?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["profiles"]["Insert"]>;
        Relationships: [];
      };
      songs: {
        Row: {
          id: string;
          artist_id: string;
          title: string;
          description: string | null;
          genre: string | null;
          cover_url: string | null;
          audio_url: string;
          duration: number | null;
          plays_count: number;
          likes_count: number;
          comments_count: number;
          is_published: boolean;
          sale_type: "free" | "fixed" | "pwyw" | "auction";
          price: number | null;
          min_price: number | null;
          max_price: number | null;
          auction_end: string | null;
          allows_resale: boolean;
          allows_investment: boolean;
          investment_shares: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          artist_id: string;
          title: string;
          description?: string | null;
          genre?: string | null;
          cover_url?: string | null;
          audio_url: string;
          duration?: number | null;
          plays_count?: number;
          likes_count?: number;
          comments_count?: number;
          is_published?: boolean;
          sale_type?: "free" | "fixed" | "pwyw" | "auction";
          price?: number | null;
          min_price?: number | null;
          max_price?: number | null;
          auction_end?: string | null;
          allows_resale?: boolean;
          allows_investment?: boolean;
          investment_shares?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["songs"]["Insert"]>;
        Relationships: [];
      };
      likes: {
        Row: {
          id: string;
          user_id: string;
          song_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          song_id: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["likes"]["Insert"]>;
        Relationships: [];
      };
      comments: {
        Row: {
          id: string;
          song_id: string;
          user_id: string;
          body: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          song_id: string;
          user_id: string;
          body: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["comments"]["Insert"]>;
        Relationships: [];
      };
      follows: {
        Row: {
          id: string;
          follower_id: string;
          following_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          follower_id: string;
          following_id: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["follows"]["Insert"]>;
        Relationships: [];
      };
      purchases: {
        Row: {
          id: string;
          buyer_id: string | null;
          song_id: string;
          amount_paid: number;
          stripe_session_id: string | null;
          stripe_payment_intent: string | null;
          status: "pending" | "completed" | "refunded";
          created_at: string;
        };
        Insert: {
          id?: string;
          buyer_id?: string | null;
          song_id: string;
          amount_paid: number;
          stripe_session_id?: string | null;
          stripe_payment_intent?: string | null;
          status?: "pending" | "completed" | "refunded";
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["purchases"]["Insert"]>;
        Relationships: [];
      };
      bids: {
        Row: {
          id: string;
          song_id: string;
          bidder_id: string;
          amount: number;
          status: "active" | "won" | "outbid" | "cancelled";
          created_at: string;
        };
        Insert: {
          id?: string;
          song_id: string;
          bidder_id: string;
          amount: number;
          status?: "active" | "won" | "outbid" | "cancelled";
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["bids"]["Insert"]>;
        Relationships: [];
      };
      transactions: {
        Row: {
          id: string;
          from_user_id: string | null;
          to_user_id: string | null;
          song_id: string | null;
          type: "sale" | "bid" | "investment" | "resale" | "payout" | "platform_fee";
          amount: number;
          platform_fee: number;
          net_amount: number | null;
          stripe_transfer_id: string | null;
          metadata: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          from_user_id?: string | null;
          to_user_id?: string | null;
          song_id?: string | null;
          type: "sale" | "bid" | "investment" | "resale" | "payout" | "platform_fee";
          amount: number;
          platform_fee?: number;
          net_amount?: number | null;
          stripe_transfer_id?: string | null;
          metadata?: Json;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["transactions"]["Insert"]>;
        Relationships: [];
      };
      investments: {
        Row: {
          id: string;
          song_id: string;
          investor_id: string;
          shares: number;
          amount_paid: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          song_id: string;
          investor_id: string;
          shares: number;
          amount_paid: number;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["investments"]["Insert"]>;
        Relationships: [];
      };
      billboards: {
        Row: {
          id: string;
          owner_id: string;
          slot: number;
          title: string;
          image_url: string;
          click_url: string | null;
          impressions: number;
          price_paid: number;
          expires_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          slot: number;
          title: string;
          image_url: string;
          click_url?: string | null;
          impressions?: number;
          price_paid: number;
          expires_at: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["billboards"]["Insert"]>;
        Relationships: [];
      };
      notifications: {
        Row: {
          id: string;
          user_id: string;
          type: string;
          actor_id: string | null;
          song_id: string | null;
          message: string | null;
          read: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          type: string;
          actor_id?: string | null;
          song_id?: string | null;
          message?: string | null;
          read?: boolean;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["notifications"]["Insert"]>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
  };
}

// Convenience types
export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type Song = Database["public"]["Tables"]["songs"]["Row"];
export type Like = Database["public"]["Tables"]["likes"]["Row"];
export type Comment = Database["public"]["Tables"]["comments"]["Row"];
export type Follow = Database["public"]["Tables"]["follows"]["Row"];
export type Purchase = Database["public"]["Tables"]["purchases"]["Row"];
export type Bid = Database["public"]["Tables"]["bids"]["Row"];
export type Transaction = Database["public"]["Tables"]["transactions"]["Row"];
export type Investment = Database["public"]["Tables"]["investments"]["Row"];
export type Billboard = Database["public"]["Tables"]["billboards"]["Row"];
export type Notification = Database["public"]["Tables"]["notifications"]["Row"];

// Extended types with joins
export type SongWithArtist = Song & { profiles: Profile };
export type CommentWithUser = Comment & { profiles: Profile };
export type BidWithBidder = Bid & { profiles: Profile };
