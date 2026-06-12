CREATE POLICY "digital_menu_subscribe_all" ON realtime.channels
  FOR SELECT TO public
  USING (pattern LIKE 'digital_menu:%');

CREATE POLICY "digital_menu_subscribe_insert_all" ON realtime.channels
  FOR INSERT TO public
  WITH CHECK (pattern LIKE 'digital_menu:%');
