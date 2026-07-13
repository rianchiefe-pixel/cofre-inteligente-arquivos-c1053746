export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      accounts: {
        Row: {
          agency: string | null
          bank_id: string | null
          color: string | null
          created_at: string
          holder: string | null
          id: string
          initial_balance: number | null
          nickname: string
          notes: string | null
          number: string | null
          profile_id: string
          type: Database["public"]["Enums"]["account_type"]
          user_id: string
        }
        Insert: {
          agency?: string | null
          bank_id?: string | null
          color?: string | null
          created_at?: string
          holder?: string | null
          id?: string
          initial_balance?: number | null
          nickname: string
          notes?: string | null
          number?: string | null
          profile_id: string
          type?: Database["public"]["Enums"]["account_type"]
          user_id: string
        }
        Update: {
          agency?: string | null
          bank_id?: string | null
          color?: string | null
          created_at?: string
          holder?: string | null
          id?: string
          initial_balance?: number | null
          nickname?: string
          notes?: string | null
          number?: string | null
          profile_id?: string
          type?: Database["public"]["Enums"]["account_type"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "accounts_bank_id_fkey"
            columns: ["bank_id"]
            isOneToOne: false
            referencedRelation: "banks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounts_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "financial_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string
          entity: string
          entity_id: string | null
          id: string
          new_value: Json | null
          note: string | null
          old_value: Json | null
          profile_id: string | null
          property_id: string | null
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          entity: string
          entity_id?: string | null
          id?: string
          new_value?: Json | null
          note?: string | null
          old_value?: Json | null
          profile_id?: string | null
          property_id?: string | null
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          entity?: string
          entity_id?: string | null
          id?: string
          new_value?: Json | null
          note?: string | null
          old_value?: Json | null
          profile_id?: string | null
          property_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "financial_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      banks: {
        Row: {
          color: string | null
          created_at: string
          id: string
          name: string
          notes: string | null
          profile_id: string
          user_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          profile_id: string
          user_id: string
        }
        Update: {
          color?: string | null
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          profile_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "banks_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "financial_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      cards: {
        Row: {
          bank_id: string | null
          brand: Database["public"]["Enums"]["card_brand"] | null
          closing_day: number | null
          created_at: string
          due_day: number | null
          holder: string | null
          id: string
          last4: string | null
          limit_amount: number | null
          name: string
          profile_id: string
          user_id: string
        }
        Insert: {
          bank_id?: string | null
          brand?: Database["public"]["Enums"]["card_brand"] | null
          closing_day?: number | null
          created_at?: string
          due_day?: number | null
          holder?: string | null
          id?: string
          last4?: string | null
          limit_amount?: number | null
          name: string
          profile_id: string
          user_id: string
        }
        Update: {
          bank_id?: string | null
          brand?: Database["public"]["Enums"]["card_brand"] | null
          closing_day?: number | null
          created_at?: string
          due_day?: number | null
          holder?: string | null
          id?: string
          last4?: string | null
          limit_amount?: number | null
          name?: string
          profile_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cards_bank_id_fkey"
            columns: ["bank_id"]
            isOneToOne: false
            referencedRelation: "banks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cards_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "financial_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          archived: boolean
          color: string | null
          created_at: string
          default_type: Database["public"]["Enums"]["transaction_type"] | null
          id: string
          name: string
          parent_id: string | null
          user_id: string
        }
        Insert: {
          archived?: boolean
          color?: string | null
          created_at?: string
          default_type?: Database["public"]["Enums"]["transaction_type"] | null
          id?: string
          name: string
          parent_id?: string | null
          user_id: string
        }
        Update: {
          archived?: boolean
          color?: string | null
          created_at?: string
          default_type?: Database["public"]["Enums"]["transaction_type"] | null
          id?: string
          name?: string
          parent_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_profiles: {
        Row: {
          accent_color: string | null
          address: string | null
          archived: boolean
          color: string | null
          created_at: string
          display_name: string | null
          email: string | null
          footer_text: string | null
          id: string
          legal_name: string | null
          logo_url: string | null
          name: string
          notes: string | null
          phone: string | null
          primary_color: string | null
          secondary_color: string | null
          tax_id: string | null
          type: Database["public"]["Enums"]["profile_type"]
          updated_at: string
          user_id: string
        }
        Insert: {
          accent_color?: string | null
          address?: string | null
          archived?: boolean
          color?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          footer_text?: string | null
          id?: string
          legal_name?: string | null
          logo_url?: string | null
          name: string
          notes?: string | null
          phone?: string | null
          primary_color?: string | null
          secondary_color?: string | null
          tax_id?: string | null
          type?: Database["public"]["Enums"]["profile_type"]
          updated_at?: string
          user_id: string
        }
        Update: {
          accent_color?: string | null
          address?: string | null
          archived?: boolean
          color?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          footer_text?: string | null
          id?: string
          legal_name?: string | null
          logo_url?: string | null
          name?: string
          notes?: string | null
          phone?: string | null
          primary_color?: string | null
          secondary_color?: string | null
          tax_id?: string | null
          type?: Database["public"]["Enums"]["profile_type"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      import_batches: {
        Row: {
          column_mapping: Json | null
          created_at: string
          created_by: string | null
          duplicate_count: number
          error_count: number
          file_mime: string | null
          file_name: string | null
          file_size: number | null
          files_errors: number
          files_processed: number
          files_total: number
          finished_at: string | null
          header_columns: Json | null
          header_row: number | null
          id: string
          imported_count: number
          normalized_rows: number
          parsed_rows: number
          pdf_pages_processed: number
          phase: string
          profile_id: string | null
          progress_percent: number
          saved_rows: number
          scope_kind: string
          separator: string | null
          status: string
          summary_json: Json | null
          total_rows: number
          unused_files_count: number
          updated_at: string
          user_id: string
          with_receipt_count: number
          without_receipt_count: number
        }
        Insert: {
          column_mapping?: Json | null
          created_at?: string
          created_by?: string | null
          duplicate_count?: number
          error_count?: number
          file_mime?: string | null
          file_name?: string | null
          file_size?: number | null
          files_errors?: number
          files_processed?: number
          files_total?: number
          finished_at?: string | null
          header_columns?: Json | null
          header_row?: number | null
          id?: string
          imported_count?: number
          normalized_rows?: number
          parsed_rows?: number
          pdf_pages_processed?: number
          phase?: string
          profile_id?: string | null
          progress_percent?: number
          saved_rows?: number
          scope_kind?: string
          separator?: string | null
          status?: string
          summary_json?: Json | null
          total_rows?: number
          unused_files_count?: number
          updated_at?: string
          user_id: string
          with_receipt_count?: number
          without_receipt_count?: number
        }
        Update: {
          column_mapping?: Json | null
          created_at?: string
          created_by?: string | null
          duplicate_count?: number
          error_count?: number
          file_mime?: string | null
          file_name?: string | null
          file_size?: number | null
          files_errors?: number
          files_processed?: number
          files_total?: number
          finished_at?: string | null
          header_columns?: Json | null
          header_row?: number | null
          id?: string
          imported_count?: number
          normalized_rows?: number
          parsed_rows?: number
          pdf_pages_processed?: number
          phase?: string
          profile_id?: string | null
          progress_percent?: number
          saved_rows?: number
          scope_kind?: string
          separator?: string | null
          status?: string
          summary_json?: Json | null
          total_rows?: number
          unused_files_count?: number
          updated_at?: string
          user_id?: string
          with_receipt_count?: number
          without_receipt_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "import_batches_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "financial_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      import_files: {
        Row: {
          batch_id: string
          content_hash: string | null
          created_at: string
          duplicate_of: string | null
          error_message: string | null
          extension: string | null
          extracted_text: string | null
          file_name: string
          folder: string | null
          id: string
          mime_type: string | null
          ocr_data: Json | null
          original_path: string
          page_count: number | null
          progress: number
          size_bytes: number | null
          status: string
          storage_path: string | null
          thumbnail_path: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          batch_id: string
          content_hash?: string | null
          created_at?: string
          duplicate_of?: string | null
          error_message?: string | null
          extension?: string | null
          extracted_text?: string | null
          file_name: string
          folder?: string | null
          id?: string
          mime_type?: string | null
          ocr_data?: Json | null
          original_path: string
          page_count?: number | null
          progress?: number
          size_bytes?: number | null
          status?: string
          storage_path?: string | null
          thumbnail_path?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          batch_id?: string
          content_hash?: string | null
          created_at?: string
          duplicate_of?: string | null
          error_message?: string | null
          extension?: string | null
          extracted_text?: string | null
          file_name?: string
          folder?: string | null
          id?: string
          mime_type?: string | null
          ocr_data?: Json | null
          original_path?: string
          page_count?: number | null
          progress?: number
          size_bytes?: number | null
          status?: string
          storage_path?: string | null
          thumbnail_path?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "import_files_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_files_duplicate_of_fkey"
            columns: ["duplicate_of"]
            isOneToOne: false
            referencedRelation: "import_files"
            referencedColumns: ["id"]
          },
        ]
      }
      import_preferences: {
        Row: {
          corrected_value: string
          created_at: string
          field: string
          id: string
          raw_key: string
          updated_at: string
          usage_count: number
          user_id: string
        }
        Insert: {
          corrected_value: string
          created_at?: string
          field: string
          id?: string
          raw_key: string
          updated_at?: string
          usage_count?: number
          user_id: string
        }
        Update: {
          corrected_value?: string
          created_at?: string
          field?: string
          id?: string
          raw_key?: string
          updated_at?: string
          usage_count?: number
          user_id?: string
        }
        Relationships: []
      }
      import_row_files: {
        Row: {
          batch_id: string
          confidence: string
          created_at: string
          file_id: string
          id: string
          is_manual: boolean
          is_primary: boolean
          match_reasons: Json
          page_number: number | null
          row_id: string
          score: number
          updated_at: string
          user_id: string
        }
        Insert: {
          batch_id: string
          confidence?: string
          created_at?: string
          file_id: string
          id?: string
          is_manual?: boolean
          is_primary?: boolean
          match_reasons?: Json
          page_number?: number | null
          row_id: string
          score?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          batch_id?: string
          confidence?: string
          created_at?: string
          file_id?: string
          id?: string
          is_manual?: boolean
          is_primary?: boolean
          match_reasons?: Json
          page_number?: number | null
          row_id?: string
          score?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "import_row_files_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_row_files_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "import_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_row_files_row_id_fkey"
            columns: ["row_id"]
            isOneToOne: false
            referencedRelation: "import_rows"
            referencedColumns: ["id"]
          },
        ]
      }
      import_rows: {
        Row: {
          account: string | null
          ai_category_confidence: number | null
          ai_category_reason: string | null
          ai_category_suggestion: string | null
          ai_data: Json | null
          ai_error: string | null
          ai_meta: Json | null
          ai_property_confidence: number | null
          ai_property_id: string | null
          ai_property_reason: string | null
          ai_status: string
          amount: number | null
          bank: string | null
          batch_id: string
          card: string | null
          card_last4: string | null
          category: string | null
          category_original: string | null
          created_at: string
          currency: string | null
          description: string | null
          error_message: string | null
          file_name: string | null
          folder_path: string | null
          general_account: boolean
          holder: string | null
          id: string
          invoice_number: string | null
          normalized_data: Json | null
          notes: string | null
          page_number: string | null
          parsed_notes: Json | null
          payee: string | null
          payment_method: string | null
          property_id: string | null
          raw_data: Json
          review_status: string
          reviewed_at: string | null
          row_number: number
          source_id: string | null
          status: string
          subcategory: string | null
          transaction_date: string | null
          transaction_type: string | null
          user_id: string
        }
        Insert: {
          account?: string | null
          ai_category_confidence?: number | null
          ai_category_reason?: string | null
          ai_category_suggestion?: string | null
          ai_data?: Json | null
          ai_error?: string | null
          ai_meta?: Json | null
          ai_property_confidence?: number | null
          ai_property_id?: string | null
          ai_property_reason?: string | null
          ai_status?: string
          amount?: number | null
          bank?: string | null
          batch_id: string
          card?: string | null
          card_last4?: string | null
          category?: string | null
          category_original?: string | null
          created_at?: string
          currency?: string | null
          description?: string | null
          error_message?: string | null
          file_name?: string | null
          folder_path?: string | null
          general_account?: boolean
          holder?: string | null
          id?: string
          invoice_number?: string | null
          normalized_data?: Json | null
          notes?: string | null
          page_number?: string | null
          parsed_notes?: Json | null
          payee?: string | null
          payment_method?: string | null
          property_id?: string | null
          raw_data: Json
          review_status?: string
          reviewed_at?: string | null
          row_number: number
          source_id?: string | null
          status?: string
          subcategory?: string | null
          transaction_date?: string | null
          transaction_type?: string | null
          user_id: string
        }
        Update: {
          account?: string | null
          ai_category_confidence?: number | null
          ai_category_reason?: string | null
          ai_category_suggestion?: string | null
          ai_data?: Json | null
          ai_error?: string | null
          ai_meta?: Json | null
          ai_property_confidence?: number | null
          ai_property_id?: string | null
          ai_property_reason?: string | null
          ai_status?: string
          amount?: number | null
          bank?: string | null
          batch_id?: string
          card?: string | null
          card_last4?: string | null
          category?: string | null
          category_original?: string | null
          created_at?: string
          currency?: string | null
          description?: string | null
          error_message?: string | null
          file_name?: string | null
          folder_path?: string | null
          general_account?: boolean
          holder?: string | null
          id?: string
          invoice_number?: string | null
          normalized_data?: Json | null
          notes?: string | null
          page_number?: string | null
          parsed_notes?: Json | null
          payee?: string | null
          payment_method?: string | null
          property_id?: string | null
          raw_data?: Json
          review_status?: string
          reviewed_at?: string | null
          row_number?: number
          source_id?: string | null
          status?: string
          subcategory?: string | null
          transaction_date?: string | null
          transaction_type?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "import_rows_ai_property_id_fkey"
            columns: ["ai_property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_rows_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_rows_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      properties: {
        Row: {
          acquisition_date: string | null
          acquisition_value: number | null
          address: string | null
          cartorio: string | null
          cep: string | null
          city: string | null
          cover_url: string | null
          created_at: string
          id: string
          market_value: number | null
          name: string
          notes: string | null
          owner_name: string | null
          owner_tax_id: string | null
          profile_id: string | null
          purpose: Database["public"]["Enums"]["property_purpose"] | null
          registration: string | null
          state: string | null
          status: Database["public"]["Enums"]["property_status"]
          type: Database["public"]["Enums"]["property_type"]
          updated_at: string
          user_id: string
        }
        Insert: {
          acquisition_date?: string | null
          acquisition_value?: number | null
          address?: string | null
          cartorio?: string | null
          cep?: string | null
          city?: string | null
          cover_url?: string | null
          created_at?: string
          id?: string
          market_value?: number | null
          name: string
          notes?: string | null
          owner_name?: string | null
          owner_tax_id?: string | null
          profile_id?: string | null
          purpose?: Database["public"]["Enums"]["property_purpose"] | null
          registration?: string | null
          state?: string | null
          status?: Database["public"]["Enums"]["property_status"]
          type?: Database["public"]["Enums"]["property_type"]
          updated_at?: string
          user_id: string
        }
        Update: {
          acquisition_date?: string | null
          acquisition_value?: number | null
          address?: string | null
          cartorio?: string | null
          cep?: string | null
          city?: string | null
          cover_url?: string | null
          created_at?: string
          id?: string
          market_value?: number | null
          name?: string
          notes?: string | null
          owner_name?: string | null
          owner_tax_id?: string | null
          profile_id?: string | null
          purpose?: Database["public"]["Enums"]["property_purpose"] | null
          registration?: string | null
          state?: string | null
          status?: Database["public"]["Enums"]["property_status"]
          type?: Database["public"]["Enums"]["property_type"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "properties_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "financial_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      property_credentials: {
        Row: {
          access_link: string | null
          created_at: string
          id: string
          login: string | null
          notes: string | null
          password: string | null
          property_id: string
          recovery_email: string | null
          service: string
          updated_at: string
          user_id: string
          website: string | null
        }
        Insert: {
          access_link?: string | null
          created_at?: string
          id?: string
          login?: string | null
          notes?: string | null
          password?: string | null
          property_id: string
          recovery_email?: string | null
          service: string
          updated_at?: string
          user_id: string
          website?: string | null
        }
        Update: {
          access_link?: string | null
          created_at?: string
          id?: string
          login?: string | null
          notes?: string | null
          password?: string | null
          property_id?: string
          recovery_email?: string | null
          service?: string
          updated_at?: string
          user_id?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "property_credentials_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      property_leases: {
        Row: {
          contract_end: string | null
          contract_start: string | null
          created_at: string
          due_day: number | null
          id: string
          notes: string | null
          property_id: string
          rent_amount: number | null
          tenant_name: string | null
          tenant_phone: string | null
          tenant_tax_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          contract_end?: string | null
          contract_start?: string | null
          created_at?: string
          due_day?: number | null
          id?: string
          notes?: string | null
          property_id: string
          rent_amount?: number | null
          tenant_name?: string | null
          tenant_phone?: string | null
          tenant_tax_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          contract_end?: string | null
          contract_start?: string | null
          created_at?: string
          due_day?: number | null
          id?: string
          notes?: string | null
          property_id?: string
          rent_amount?: number | null
          tenant_name?: string | null
          tenant_phone?: string | null
          tenant_tax_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "property_leases_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: true
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      property_obligations: {
        Row: {
          amount: number | null
          created_at: string
          document_url: string | null
          due_date: string | null
          id: string
          kind: string
          label: string | null
          notes: string | null
          periodicity: string | null
          property_id: string
          status: string
          supplier: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          amount?: number | null
          created_at?: string
          document_url?: string | null
          due_date?: string | null
          id?: string
          kind: string
          label?: string | null
          notes?: string | null
          periodicity?: string | null
          property_id: string
          status?: string
          supplier?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number | null
          created_at?: string
          document_url?: string | null
          due_date?: string | null
          id?: string
          kind?: string
          label?: string | null
          notes?: string | null
          periodicity?: string | null
          property_id?: string
          status?: string
          supplier?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "property_obligations_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      property_tasks: {
        Row: {
          assignee: string | null
          attachments: Json
          completed_at: string | null
          created_at: string
          description: string | null
          due_date: string | null
          id: string
          notes: string | null
          priority: string
          property_id: string | null
          status: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          assignee?: string | null
          attachments?: Json
          completed_at?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          notes?: string | null
          priority?: string
          property_id?: string | null
          status?: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          assignee?: string | null
          attachments?: Json
          completed_at?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          notes?: string | null
          priority?: string
          property_id?: string | null
          status?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "property_tasks_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      receipts: {
        Row: {
          account_id: string | null
          amount: number | null
          approved_at: string | null
          auth_code: string | null
          bank_id: string | null
          bank_name: string | null
          card_id: string | null
          category_id: string | null
          created_at: string
          description: string | null
          duplicate_of: string | null
          duplicate_score: number
          file_hash: string | null
          file_mime: string | null
          file_name: string | null
          file_path: string
          file_size: number | null
          id: string
          import_batch_id: string | null
          is_fixed: boolean | null
          notes: string | null
          ocr_data: Json | null
          ocr_error: string | null
          ocr_status: Database["public"]["Enums"]["ocr_status"]
          payment_date: string | null
          payment_method: Database["public"]["Enums"]["payment_method"] | null
          profile_id: string | null
          property_id: string | null
          recipient_id: string | null
          recipient_name: string | null
          recipient_tax_id: string | null
          status: Database["public"]["Enums"]["receipt_status"]
          transaction_type:
            | Database["public"]["Enums"]["transaction_type"]
            | null
          updated_at: string
          user_id: string
        }
        Insert: {
          account_id?: string | null
          amount?: number | null
          approved_at?: string | null
          auth_code?: string | null
          bank_id?: string | null
          bank_name?: string | null
          card_id?: string | null
          category_id?: string | null
          created_at?: string
          description?: string | null
          duplicate_of?: string | null
          duplicate_score?: number
          file_hash?: string | null
          file_mime?: string | null
          file_name?: string | null
          file_path: string
          file_size?: number | null
          id?: string
          import_batch_id?: string | null
          is_fixed?: boolean | null
          notes?: string | null
          ocr_data?: Json | null
          ocr_error?: string | null
          ocr_status?: Database["public"]["Enums"]["ocr_status"]
          payment_date?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          profile_id?: string | null
          property_id?: string | null
          recipient_id?: string | null
          recipient_name?: string | null
          recipient_tax_id?: string | null
          status?: Database["public"]["Enums"]["receipt_status"]
          transaction_type?:
            | Database["public"]["Enums"]["transaction_type"]
            | null
          updated_at?: string
          user_id: string
        }
        Update: {
          account_id?: string | null
          amount?: number | null
          approved_at?: string | null
          auth_code?: string | null
          bank_id?: string | null
          bank_name?: string | null
          card_id?: string | null
          category_id?: string | null
          created_at?: string
          description?: string | null
          duplicate_of?: string | null
          duplicate_score?: number
          file_hash?: string | null
          file_mime?: string | null
          file_name?: string | null
          file_path?: string
          file_size?: number | null
          id?: string
          import_batch_id?: string | null
          is_fixed?: boolean | null
          notes?: string | null
          ocr_data?: Json | null
          ocr_error?: string | null
          ocr_status?: Database["public"]["Enums"]["ocr_status"]
          payment_date?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          profile_id?: string | null
          property_id?: string | null
          recipient_id?: string | null
          recipient_name?: string | null
          recipient_tax_id?: string | null
          status?: Database["public"]["Enums"]["receipt_status"]
          transaction_type?:
            | Database["public"]["Enums"]["transaction_type"]
            | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "receipts_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipts_bank_id_fkey"
            columns: ["bank_id"]
            isOneToOne: false
            referencedRelation: "banks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipts_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipts_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipts_duplicate_of_fkey"
            columns: ["duplicate_of"]
            isOneToOne: false
            referencedRelation: "receipts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipts_import_batch_id_fkey"
            columns: ["import_batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipts_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "financial_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipts_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipts_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "recipients"
            referencedColumns: ["id"]
          },
        ]
      }
      recipients: {
        Row: {
          created_at: string
          default_category_id: string | null
          default_profile_id: string | null
          default_type: Database["public"]["Enums"]["transaction_type"] | null
          id: string
          name: string
          notes: string | null
          tax_id: string | null
          usage_count: number
          user_id: string
        }
        Insert: {
          created_at?: string
          default_category_id?: string | null
          default_profile_id?: string | null
          default_type?: Database["public"]["Enums"]["transaction_type"] | null
          id?: string
          name: string
          notes?: string | null
          tax_id?: string | null
          usage_count?: number
          user_id: string
        }
        Update: {
          created_at?: string
          default_category_id?: string | null
          default_profile_id?: string | null
          default_type?: Database["public"]["Enums"]["transaction_type"] | null
          id?: string
          name?: string
          notes?: string | null
          tax_id?: string | null
          usage_count?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recipients_default_category_id_fkey"
            columns: ["default_category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipients_default_profile_id_fkey"
            columns: ["default_profile_id"]
            isOneToOne: false
            referencedRelation: "financial_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      account_type:
        | "corrente"
        | "poupanca"
        | "pj"
        | "investimento"
        | "cartao"
        | "carteira_digital"
        | "outro"
      app_role:
        | "proprietario"
        | "administrador"
        | "contador"
        | "colaborador"
        | "visualizador"
      card_brand: "visa" | "mastercard" | "elo" | "amex" | "hipercard" | "outro"
      ocr_status: "queued" | "processing" | "done" | "failed"
      payment_method:
        | "debito"
        | "credito_vista"
        | "credito_parcelado"
        | "pix"
        | "ted"
        | "boleto"
        | "dinheiro"
        | "transferencia"
        | "outro"
      profile_type:
        | "pessoa_fisica"
        | "empresa"
        | "holding"
        | "imovel"
        | "projeto"
        | "outro"
      property_purpose:
        | "moradia"
        | "aluguel"
        | "venda"
        | "investimento"
        | "uso_empresarial"
        | "rural"
        | "outro"
      property_status:
        | "proprio"
        | "alugado"
        | "em_reforma"
        | "vendido"
        | "em_aquisicao"
        | "em_inventario"
        | "arquivado"
        | "desocupado"
        | "em_uso_familiar"
        | "comodato"
        | "a_venda"
        | "em_leilao"
        | "documentacao_pendente"
        | "outro"
      property_type:
        | "casa"
        | "apartamento"
        | "terreno"
        | "sala_comercial"
        | "fazenda"
        | "predio"
        | "outro"
        | "galpao"
        | "lote"
        | "terreno_urbano"
        | "terreno_rural"
      receipt_status:
        | "pending"
        | "approved"
        | "rejected"
        | "duplicate"
        | "archived"
      transaction_type:
        | "despesa"
        | "investimento"
        | "gasto_fixo"
        | "gasto_variavel"
        | "pessoal"
        | "empresarial"
        | "patrimonial"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      account_type: [
        "corrente",
        "poupanca",
        "pj",
        "investimento",
        "cartao",
        "carteira_digital",
        "outro",
      ],
      app_role: [
        "proprietario",
        "administrador",
        "contador",
        "colaborador",
        "visualizador",
      ],
      card_brand: ["visa", "mastercard", "elo", "amex", "hipercard", "outro"],
      ocr_status: ["queued", "processing", "done", "failed"],
      payment_method: [
        "debito",
        "credito_vista",
        "credito_parcelado",
        "pix",
        "ted",
        "boleto",
        "dinheiro",
        "transferencia",
        "outro",
      ],
      profile_type: [
        "pessoa_fisica",
        "empresa",
        "holding",
        "imovel",
        "projeto",
        "outro",
      ],
      property_purpose: [
        "moradia",
        "aluguel",
        "venda",
        "investimento",
        "uso_empresarial",
        "rural",
        "outro",
      ],
      property_status: [
        "proprio",
        "alugado",
        "em_reforma",
        "vendido",
        "em_aquisicao",
        "em_inventario",
        "arquivado",
        "desocupado",
        "em_uso_familiar",
        "comodato",
        "a_venda",
        "em_leilao",
        "documentacao_pendente",
        "outro",
      ],
      property_type: [
        "casa",
        "apartamento",
        "terreno",
        "sala_comercial",
        "fazenda",
        "predio",
        "outro",
        "galpao",
        "lote",
        "terreno_urbano",
        "terreno_rural",
      ],
      receipt_status: [
        "pending",
        "approved",
        "rejected",
        "duplicate",
        "archived",
      ],
      transaction_type: [
        "despesa",
        "investimento",
        "gasto_fixo",
        "gasto_variavel",
        "pessoal",
        "empresarial",
        "patrimonial",
      ],
    },
  },
} as const
