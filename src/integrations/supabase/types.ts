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
      card_holders: {
        Row: {
          card_id: string
          created_at: string
          holder_name: string
          id: string
          is_primary: boolean
          last4: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          card_id: string
          created_at?: string
          holder_name: string
          id?: string
          is_primary?: boolean
          last4?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          card_id?: string
          created_at?: string
          holder_name?: string
          id?: string
          is_primary?: boolean
          last4?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "card_holders_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
        ]
      }
      card_statements: {
        Row: {
          bank_name: string | null
          batch_id: string | null
          card_id: string | null
          closing_date: string | null
          created_at: string
          document_type: string
          due_date: string | null
          error: string | null
          id: string
          import_file_id: string | null
          minimum_payment: number | null
          pages_total: number | null
          period_end: string | null
          period_start: string | null
          progress_pct: number | null
          progress_stage: string | null
          raw_analysis: Json | null
          source_file_name: string | null
          source_file_path: string | null
          source_hash: string | null
          status: string
          total_amount: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          bank_name?: string | null
          batch_id?: string | null
          card_id?: string | null
          closing_date?: string | null
          created_at?: string
          document_type?: string
          due_date?: string | null
          error?: string | null
          id?: string
          import_file_id?: string | null
          minimum_payment?: number | null
          pages_total?: number | null
          period_end?: string | null
          period_start?: string | null
          progress_pct?: number | null
          progress_stage?: string | null
          raw_analysis?: Json | null
          source_file_name?: string | null
          source_file_path?: string | null
          source_hash?: string | null
          status?: string
          total_amount?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          bank_name?: string | null
          batch_id?: string | null
          card_id?: string | null
          closing_date?: string | null
          created_at?: string
          document_type?: string
          due_date?: string | null
          error?: string | null
          id?: string
          import_file_id?: string | null
          minimum_payment?: number | null
          pages_total?: number | null
          period_end?: string | null
          period_start?: string | null
          progress_pct?: number | null
          progress_stage?: string | null
          raw_analysis?: Json | null
          source_file_name?: string | null
          source_file_path?: string | null
          source_hash?: string | null
          status?: string
          total_amount?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "card_statements_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_statements_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_statements_import_file_id_fkey"
            columns: ["import_file_id"]
            isOneToOne: false
            referencedRelation: "import_files"
            referencedColumns: ["id"]
          },
        ]
      }
      card_transactions: {
        Row: {
          amount: number | null
          card_holder_id: string | null
          card_id: string | null
          category: string | null
          confidence: number | null
          country: string | null
          created_at: string
          currency: string | null
          description: string | null
          holder_name: string | null
          id: string
          installment_current: number | null
          installment_total: number | null
          kind: string | null
          last4: string | null
          low_confidence: boolean | null
          match_score: number | null
          match_status: string
          matched_import_row_id: string | null
          merchant_normalized: string | null
          notes: string | null
          original_series_id: string | null
          page_number: number | null
          profile_id: string | null
          property_id: string | null
          raw: Json | null
          raw_text: string | null
          statement_id: string
          status: string
          txn_date: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          amount?: number | null
          card_holder_id?: string | null
          card_id?: string | null
          category?: string | null
          confidence?: number | null
          country?: string | null
          created_at?: string
          currency?: string | null
          description?: string | null
          holder_name?: string | null
          id?: string
          installment_current?: number | null
          installment_total?: number | null
          kind?: string | null
          last4?: string | null
          low_confidence?: boolean | null
          match_score?: number | null
          match_status?: string
          matched_import_row_id?: string | null
          merchant_normalized?: string | null
          notes?: string | null
          original_series_id?: string | null
          page_number?: number | null
          profile_id?: string | null
          property_id?: string | null
          raw?: Json | null
          raw_text?: string | null
          statement_id: string
          status?: string
          txn_date?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number | null
          card_holder_id?: string | null
          card_id?: string | null
          category?: string | null
          confidence?: number | null
          country?: string | null
          created_at?: string
          currency?: string | null
          description?: string | null
          holder_name?: string | null
          id?: string
          installment_current?: number | null
          installment_total?: number | null
          kind?: string | null
          last4?: string | null
          low_confidence?: boolean | null
          match_score?: number | null
          match_status?: string
          matched_import_row_id?: string | null
          merchant_normalized?: string | null
          notes?: string | null
          original_series_id?: string | null
          page_number?: number | null
          profile_id?: string | null
          property_id?: string | null
          raw?: Json | null
          raw_text?: string | null
          statement_id?: string
          status?: string
          txn_date?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "card_transactions_card_holder_id_fkey"
            columns: ["card_holder_id"]
            isOneToOne: false
            referencedRelation: "card_holders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_transactions_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_transactions_matched_import_row_id_fkey"
            columns: ["matched_import_row_id"]
            isOneToOne: false
            referencedRelation: "import_rows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_transactions_statement_id_fkey"
            columns: ["statement_id"]
            isOneToOne: false
            referencedRelation: "card_statements"
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
          credit_limit: number | null
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
          credit_limit?: number | null
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
          credit_limit?: number | null
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
          expense_behavior: string | null
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
          expense_behavior?: string | null
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
          expense_behavior?: string | null
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
      classification_rules: {
        Row: {
          active: boolean
          category_id: string | null
          cost_center_id: string | null
          created_at: string
          id: string
          name: string
          profile_id: string
          property_id: string | null
          terms: string[]
          updated_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          category_id?: string | null
          cost_center_id?: string | null
          created_at?: string
          id?: string
          name: string
          profile_id: string
          property_id?: string | null
          terms?: string[]
          updated_at?: string
          user_id: string
        }
        Update: {
          active?: boolean
          category_id?: string | null
          cost_center_id?: string | null
          created_at?: string
          id?: string
          name?: string
          profile_id?: string
          property_id?: string | null
          terms?: string[]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "classification_rules_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "classification_rules_cost_center_id_fkey"
            columns: ["cost_center_id"]
            isOneToOne: false
            referencedRelation: "cost_centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "classification_rules_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "financial_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "classification_rules_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      cost_centers: {
        Row: {
          archived: boolean
          created_at: string
          id: string
          name: string
          notes: string | null
          profile_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          archived?: boolean
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          profile_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          archived?: boolean
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          profile_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cost_centers_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "financial_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      duplicate_checks: {
        Row: {
          candidate_receipt_id: string
          created_at: string
          different_fields: string[] | null
          id: string
          matched_fields: string[] | null
          new_receipt_id: string
          reviewed_at: string | null
          reviewed_by: string | null
          similarity_score: number
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          candidate_receipt_id: string
          created_at?: string
          different_fields?: string[] | null
          id?: string
          matched_fields?: string[] | null
          new_receipt_id: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          similarity_score?: number
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          candidate_receipt_id?: string
          created_at?: string
          different_fields?: string[] | null
          id?: string
          matched_fields?: string[] | null
          new_receipt_id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          similarity_score?: number
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "duplicate_checks_candidate_receipt_id_fkey"
            columns: ["candidate_receipt_id"]
            isOneToOne: false
            referencedRelation: "receipts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "duplicate_checks_new_receipt_id_fkey"
            columns: ["new_receipt_id"]
            isOneToOne: false
            referencedRelation: "receipts"
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
          document_type: string
          duplicate_of: string | null
          error_message: string | null
          exclusion_reason: string | null
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
          readable: boolean | null
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
          document_type?: string
          duplicate_of?: string | null
          error_message?: string | null
          exclusion_reason?: string | null
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
          readable?: boolean | null
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
          document_type?: string
          duplicate_of?: string | null
          error_message?: string | null
          exclusion_reason?: string | null
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
          readable?: boolean | null
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
          ai_suggested_amount: number | null
          ai_suggested_date: string | null
          ai_suggested_payee: string | null
          ai_suggestion_confidence: number | null
          ai_suggestion_reason: string | null
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
          kind: string | null
          manually_verified_amount_cents: number | null
          normalized_data: Json | null
          notes: string | null
          original_amount_cents: number | null
          original_payee: string | null
          original_source_id: string | null
          original_transaction_date: string | null
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
          ai_suggested_amount?: number | null
          ai_suggested_date?: string | null
          ai_suggested_payee?: string | null
          ai_suggestion_confidence?: number | null
          ai_suggestion_reason?: string | null
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
          kind?: string | null
          manually_verified_amount_cents?: number | null
          normalized_data?: Json | null
          notes?: string | null
          original_amount_cents?: number | null
          original_payee?: string | null
          original_source_id?: string | null
          original_transaction_date?: string | null
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
          ai_suggested_amount?: number | null
          ai_suggested_date?: string | null
          ai_suggested_payee?: string | null
          ai_suggestion_confidence?: number | null
          ai_suggestion_reason?: string | null
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
          kind?: string | null
          manually_verified_amount_cents?: number | null
          normalized_data?: Json | null
          notes?: string | null
          original_amount_cents?: number | null
          original_payee?: string | null
          original_source_id?: string | null
          original_transaction_date?: string | null
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
          cost_center_id: string | null
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
          cost_center_id?: string | null
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
          cost_center_id?: string | null
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
            foreignKeyName: "properties_cost_center_id_fkey"
            columns: ["cost_center_id"]
            isOneToOne: false
            referencedRelation: "cost_centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "properties_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "financial_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      property_credential_links: {
        Row: {
          created_at: string
          credential_id: string
          id: string
          property_id: string
        }
        Insert: {
          created_at?: string
          credential_id: string
          id?: string
          property_id: string
        }
        Update: {
          created_at?: string
          credential_id?: string
          id?: string
          property_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "property_credential_links_credential_id_fkey"
            columns: ["credential_id"]
            isOneToOne: false
            referencedRelation: "property_credentials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_credential_links_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
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
          password_cipher: string | null
          password_set_at: string | null
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
          password_cipher?: string | null
          password_set_at?: string | null
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
          password_cipher?: string | null
          password_set_at?: string | null
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
          client_number: string | null
          consumer_unit: string | null
          contract_number: string | null
          created_at: string
          credential_id: string | null
          document_url: string | null
          due_date: string | null
          id: string
          installation_number: string | null
          kind: string
          label: string | null
          notes: string | null
          periodicity: string | null
          property_id: string
          real_estate_tax_id: string | null
          registration_number: string | null
          status: string
          supplier: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          amount?: number | null
          client_number?: string | null
          consumer_unit?: string | null
          contract_number?: string | null
          created_at?: string
          credential_id?: string | null
          document_url?: string | null
          due_date?: string | null
          id?: string
          installation_number?: string | null
          kind: string
          label?: string | null
          notes?: string | null
          periodicity?: string | null
          property_id: string
          real_estate_tax_id?: string | null
          registration_number?: string | null
          status?: string
          supplier?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number | null
          client_number?: string | null
          consumer_unit?: string | null
          contract_number?: string | null
          created_at?: string
          credential_id?: string | null
          document_url?: string | null
          due_date?: string | null
          id?: string
          installation_number?: string | null
          kind?: string
          label?: string | null
          notes?: string | null
          periodicity?: string | null
          property_id?: string
          real_estate_tax_id?: string | null
          registration_number?: string | null
          status?: string
          supplier?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "property_obligations_credential_id_fkey"
            columns: ["credential_id"]
            isOneToOne: false
            referencedRelation: "property_credentials"
            referencedColumns: ["id"]
          },
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
      receipt_analysis_batches: {
        Row: {
          already_found: number | null
          created_at: string | null
          errors: number | null
          file_name: string
          files_processed: number | null
          files_total: number | null
          finished_at: string | null
          id: string
          needs_review: number | null
          not_found: number | null
          status: string
          user_id: string
        }
        Insert: {
          already_found?: number | null
          created_at?: string | null
          errors?: number | null
          file_name: string
          files_processed?: number | null
          files_total?: number | null
          finished_at?: string | null
          id?: string
          needs_review?: number | null
          not_found?: number | null
          status: string
          user_id: string
        }
        Update: {
          already_found?: number | null
          created_at?: string | null
          errors?: number | null
          file_name?: string
          files_processed?: number | null
          files_total?: number | null
          finished_at?: string | null
          id?: string
          needs_review?: number | null
          not_found?: number | null
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      receipt_analysis_files: {
        Row: {
          analysis_reason: string | null
          analysis_status:
            | Database["public"]["Enums"]["receipt_analysis_status"]
            | null
          batch_id: string
          candidate_receipt_id: string | null
          content_hash: string
          created_at: string | null
          file_name: string
          id: string
          matched_fields: Json | null
          original_path: string
          similarity_score: number | null
          size_bytes: number | null
          storage_path: string | null
          user_id: string
        }
        Insert: {
          analysis_reason?: string | null
          analysis_status?:
            | Database["public"]["Enums"]["receipt_analysis_status"]
            | null
          batch_id: string
          candidate_receipt_id?: string | null
          content_hash: string
          created_at?: string | null
          file_name: string
          id?: string
          matched_fields?: Json | null
          original_path: string
          similarity_score?: number | null
          size_bytes?: number | null
          storage_path?: string | null
          user_id: string
        }
        Update: {
          analysis_reason?: string | null
          analysis_status?:
            | Database["public"]["Enums"]["receipt_analysis_status"]
            | null
          batch_id?: string
          candidate_receipt_id?: string | null
          content_hash?: string
          created_at?: string | null
          file_name?: string
          id?: string
          matched_fields?: Json | null
          original_path?: string
          similarity_score?: number | null
          size_bytes?: number | null
          storage_path?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "receipt_analysis_files_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "receipt_analysis_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      receipts: {
        Row: {
          account_id: string | null
          ai_confidence: string | null
          ai_extracted_data: Json | null
          ai_history_summary: Json | null
          ai_reason: string | null
          ai_suggested_category_id: string | null
          ai_suggested_profile_id: string | null
          amount: number | null
          approved_at: string | null
          auth_code: string | null
          bank_id: string | null
          bank_name: string | null
          card_holder_id: string | null
          card_id: string | null
          category_id: string | null
          cost_center_id: string | null
          created_at: string
          description: string | null
          duplicate_of: string | null
          duplicate_score: number
          expense_behavior: string | null
          file_hash: string | null
          file_mime: string | null
          file_name: string | null
          file_path: string | null
          file_size: number | null
          id: string
          import_batch_id: string | null
          import_row_id: string | null
          is_fixed: boolean | null
          is_manual_correction: boolean | null
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
          user_confirmed_at: string | null
          user_id: string
        }
        Insert: {
          account_id?: string | null
          ai_confidence?: string | null
          ai_extracted_data?: Json | null
          ai_history_summary?: Json | null
          ai_reason?: string | null
          ai_suggested_category_id?: string | null
          ai_suggested_profile_id?: string | null
          amount?: number | null
          approved_at?: string | null
          auth_code?: string | null
          bank_id?: string | null
          bank_name?: string | null
          card_holder_id?: string | null
          card_id?: string | null
          category_id?: string | null
          cost_center_id?: string | null
          created_at?: string
          description?: string | null
          duplicate_of?: string | null
          duplicate_score?: number
          expense_behavior?: string | null
          file_hash?: string | null
          file_mime?: string | null
          file_name?: string | null
          file_path?: string | null
          file_size?: number | null
          id?: string
          import_batch_id?: string | null
          import_row_id?: string | null
          is_fixed?: boolean | null
          is_manual_correction?: boolean | null
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
          user_confirmed_at?: string | null
          user_id: string
        }
        Update: {
          account_id?: string | null
          ai_confidence?: string | null
          ai_extracted_data?: Json | null
          ai_history_summary?: Json | null
          ai_reason?: string | null
          ai_suggested_category_id?: string | null
          ai_suggested_profile_id?: string | null
          amount?: number | null
          approved_at?: string | null
          auth_code?: string | null
          bank_id?: string | null
          bank_name?: string | null
          card_holder_id?: string | null
          card_id?: string | null
          category_id?: string | null
          cost_center_id?: string | null
          created_at?: string
          description?: string | null
          duplicate_of?: string | null
          duplicate_score?: number
          expense_behavior?: string | null
          file_hash?: string | null
          file_mime?: string | null
          file_name?: string | null
          file_path?: string | null
          file_size?: number | null
          id?: string
          import_batch_id?: string | null
          import_row_id?: string | null
          is_fixed?: boolean | null
          is_manual_correction?: boolean | null
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
          user_confirmed_at?: string | null
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
            foreignKeyName: "receipts_ai_suggested_category_id_fkey"
            columns: ["ai_suggested_category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipts_ai_suggested_profile_id_fkey"
            columns: ["ai_suggested_profile_id"]
            isOneToOne: false
            referencedRelation: "financial_profiles"
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
            foreignKeyName: "receipts_card_holder_id_fkey"
            columns: ["card_holder_id"]
            isOneToOne: false
            referencedRelation: "card_holders"
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
            foreignKeyName: "receipts_cost_center_id_fkey"
            columns: ["cost_center_id"]
            isOneToOne: false
            referencedRelation: "cost_centers"
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
            foreignKeyName: "receipts_import_row_id_fkey"
            columns: ["import_row_id"]
            isOneToOne: true
            referencedRelation: "import_rows"
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
      recurring_expense_matches: {
        Row: {
          created_at: string | null
          id: string
          month: string
          receipt_id: string | null
          recurring_fixed_expense_id: string
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          month: string
          receipt_id?: string | null
          recurring_fixed_expense_id: string
          status: string
          user_id?: string
        }
        Update: {
          created_at?: string | null
          id?: string
          month?: string
          receipt_id?: string | null
          recurring_fixed_expense_id?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recurring_expense_matches_receipt_id_fkey"
            columns: ["receipt_id"]
            isOneToOne: false
            referencedRelation: "receipts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_expense_matches_recurring_fixed_expense_id_fkey"
            columns: ["recurring_fixed_expense_id"]
            isOneToOne: false
            referencedRelation: "recurring_fixed_expenses"
            referencedColumns: ["id"]
          },
        ]
      }
      recurring_fixed_expenses: {
        Row: {
          active: boolean | null
          category_id: string | null
          created_at: string | null
          description_pattern: string | null
          end_month: string | null
          id: string
          merchant_pattern: string | null
          name: string
          profile_id: string
          property_id: string | null
          recurrence: string | null
          start_month: string
          user_id: string
        }
        Insert: {
          active?: boolean | null
          category_id?: string | null
          created_at?: string | null
          description_pattern?: string | null
          end_month?: string | null
          id?: string
          merchant_pattern?: string | null
          name: string
          profile_id: string
          property_id?: string | null
          recurrence?: string | null
          start_month?: string
          user_id?: string
        }
        Update: {
          active?: boolean | null
          category_id?: string | null
          created_at?: string | null
          description_pattern?: string | null
          end_month?: string | null
          id?: string
          merchant_pattern?: string | null
          name?: string
          profile_id?: string
          property_id?: string | null
          recurrence?: string | null
          start_month?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recurring_fixed_expenses_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_fixed_expenses_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "financial_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_fixed_expenses_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      temporary_access_tokens: {
        Row: {
          access_count: number
          created_at: string
          created_by: string | null
          expires_at: string
          first_accessed_at: string | null
          id: string
          last_accessed_at: string | null
          metadata: Json | null
          profile_id: string
          purpose: string
          revoked_at: string | null
          revoked_by: string | null
          token: string
        }
        Insert: {
          access_count?: number
          created_at?: string
          created_by?: string | null
          expires_at: string
          first_accessed_at?: string | null
          id?: string
          last_accessed_at?: string | null
          metadata?: Json | null
          profile_id: string
          purpose?: string
          revoked_at?: string | null
          revoked_by?: string | null
          token: string
        }
        Update: {
          access_count?: number
          created_at?: string
          created_by?: string | null
          expires_at?: string
          first_accessed_at?: string | null
          id?: string
          last_accessed_at?: string | null
          metadata?: Json | null
          profile_id?: string
          purpose?: string
          revoked_at?: string | null
          revoked_by?: string | null
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "temporary_access_tokens_profile_id_fkey"
            columns: ["profile_id"]
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
      apply_holding_organization_rpc: {
        Args: { p_items: Json; p_profile_id: string; p_run_id: string }
        Returns: {
          applied: boolean
          reason: string
          receipt_id: string
        }[]
      }
      approve_import_row_rpc: {
        Args: { p_overrides?: Json; p_row_id: string }
        Returns: {
          file_path: string
          receipt_id: string
          receipt_status: string
          row_review_status: string
        }[]
      }
      attach_receipt_file_rpc: {
        Args: { p_file_id: string; p_make_primary?: boolean; p_row_id: string }
        Returns: {
          confidence: string
          is_primary: boolean
          link_id: string
        }[]
      }
      create_card_with_holders_rpc: {
        Args: { p_card: Json; p_holders?: Json }
        Returns: {
          card_id: string
          holders_created: number
        }[]
      }
      delete_account_rpc: {
        Args: { p_id: string; p_reassign_to: string }
        Returns: {
          deleted_id: string
          reassigned_receipts: number
        }[]
      }
      delete_bank_rpc: {
        Args: { p_id: string; p_reassign_to: string }
        Returns: {
          deleted_id: string
          reassigned_accounts: number
          reassigned_cards: number
          reassigned_receipts: number
        }[]
      }
      delete_category_rpc: {
        Args: { p_id: string; p_reassign_to: string }
        Returns: {
          deleted_id: string
          orphaned_children: number
          reassigned_receipts: number
        }[]
      }
      delete_receipts_safely: {
        Args: { p_receipt_ids: string[] }
        Returns: {
          deleted_id: string
          safe_file_path: string
        }[]
      }
      detach_receipt_file_rpc: {
        Args: { p_link_id: string }
        Returns: {
          confidence: string
          is_primary: boolean
          link_id: string
        }[]
      }
      ensure_cost_center_rpc: {
        Args: { p_name: string; p_profile_id: string }
        Returns: {
          cost_center_id: string
          created: boolean
        }[]
      }
      fail_stale_import_batches_rpc: {
        Args: { p_minutes?: number }
        Returns: number
      }
      finalize_card_statement_rpc: {
        Args: { p_statement_id: string }
        Returns: {
          approved_count: number
          later_count: number
          statement_id: string
          statement_status: string
        }[]
      }
      has_permission: {
        Args: { _perm: string; _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      replace_auto_row_links_rpc: {
        Args: { p_batch_id: string; p_links: Json }
        Returns: {
          deleted_links: number
          inserted_links: number
        }[]
      }
      require_permission: { Args: { _perm: string }; Returns: string }
      reset_demo_data_rpc: {
        Args: never
        Returns: {
          files_removed: number
          receipts_removed: number
          rows_removed: number
          storage_paths: string[]
        }[]
      }
      reveal_property_credential_rpc: {
        Args: { p_id: string }
        Returns: {
          credential_id: string
          legacy_password: string
          password_cipher: string
        }[]
      }
      role_permissions: {
        Args: { _role: Database["public"]["Enums"]["app_role"] }
        Returns: string[]
      }
      set_import_row_review_rpc: {
        Args: { p_reason?: string; p_row_id: string; p_status: string }
        Returns: {
          receipt_status: string
          row_review_status: string
        }[]
      }
      set_primary_receipt_file_rpc: {
        Args: { p_link_id: string }
        Returns: {
          confidence: string
          is_primary: boolean
          link_id: string
        }[]
      }
      sync_property_credential_links: {
        Args: { p_credential_id: string; p_property_ids: string[] }
        Returns: undefined
      }
      undo_holding_organization_rpc: {
        Args: { p_run_id: string }
        Returns: {
          reverted: number
        }[]
      }
      upsert_account_rpc: {
        Args: { p_account: Json; p_id: string }
        Returns: {
          account_id: string
        }[]
      }
      upsert_bank_rpc: {
        Args: { p_bank: Json; p_id: string }
        Returns: {
          bank_id: string
        }[]
      }
      upsert_category_rpc: {
        Args: { p_category: Json; p_id: string }
        Returns: {
          category_id: string
        }[]
      }
      upsert_property_credential_rpc: {
        Args: {
          p_credential: Json
          p_id: string
          p_password_changed: boolean
          p_password_cipher: string
          p_property_id: string
        }
        Returns: {
          credential_id: string
        }[]
      }
      upsert_property_lease_rpc: {
        Args: { p_lease: Json; p_property_id: string }
        Returns: {
          lease_id: string
        }[]
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
      receipt_analysis_status:
        | "processing"
        | "already_posted"
        | "possible_match"
        | "not_found"
        | "duplicate_in_zip"
        | "error"
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
      receipt_analysis_status: [
        "processing",
        "already_posted",
        "possible_match",
        "not_found",
        "duplicate_in_zip",
        "error",
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
