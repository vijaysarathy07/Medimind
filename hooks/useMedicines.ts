import { useState, useEffect } from 'react';
import { supabase } from '../services/supabase';

export type Medicine = {
  id: string;
  name: string;
  dosage: string;
  frequency: string;
  stock: number;
  created_at: string;
};

export function useMedicines() {
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function fetchMedicines() {
    setLoading(true);
    const { data, error } = await supabase
      .from('medicines')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) setError(error.message);
    else setMedicines(data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    fetchMedicines();
  }, []);

  return { medicines, loading, error, refetch: fetchMedicines };
}
