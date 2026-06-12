INSERT INTO storage.buckets (name, public) 
VALUES ('menu_items', true)
ON CONFLICT (name) DO NOTHING;
