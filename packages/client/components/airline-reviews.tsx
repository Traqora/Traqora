'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Star,
  StarHalf,
  StarOff,
  ThumbsUp,
  ThumbsDown,
  User,
  Calendar,
  CheckCircle,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface Review {
  id: string;
  airlineCode: string;
  rating: number;
  title?: string;
  content?: string;
  pros?: string[];
  cons?: string[];
  isVerified: boolean;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
  user: {
    walletAddress: string;
  };
  booking: {
    id: string;
    flight: {
      from: string;
      to: string;
      airline: string;
    };
  };
}

interface AirlineStats {
  airlineCode: string;
  averageRating: number;
  totalReviews: number;
  ratingDistribution: Record<number, number>;
  verifiedReviews: number;
  unverifiedReviews: number;
}

interface AirlineReviewsProps {
  airlineCode: string;
  airlineName?: string;
  userId?: string;
  bookingId?: string;
  maxDisplay?: number;
  showWriteReview?: boolean;
  className?: string;
}

const StarRating = ({
  rating,
  onRatingChange,
  size = 'md',
  readonly = false,
}: {
  rating: number;
  onRatingChange?: (rating: number) => void;
  size?: 'sm' | 'md' | 'lg';
  readonly?: boolean;
}) => {
  const sizes = {
    sm: 'h-4 w-4',
    md: 'h-5 w-5',
    lg: 'h-6 w-6',
  };

  const starSize = sizes[size];

  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          onClick={() => !readonly && onRatingChange?.(star)}
          className={cn(
            'transition-colors',
            !readonly && 'hover:scale-110',
            star <= rating ? 'text-yellow-400' : 'text-gray-300'
          )}
          disabled={readonly}
          aria-label={`Rate ${star} stars`}
        >
          {star <= rating ? (
            <Star className={starSize} fill="currentColor" />
          ) : star - 0.5 <= rating ? (
            <StarHalf className={starSize} fill="currentColor" />
          ) : (
            <StarOff className={starSize} />
          )}
        </button>
      ))}
    </div>
  );
};

const RatingDistributionBar = ({
  rating,
  count,
  total,
}: {
  rating: number;
  count: number;
  total: number;
}) => {
  const percentage = total > 0 ? (count / total) * 100 : 0;

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground w-4">{rating}</span>
      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
        <div
          className="h-full bg-yellow-400 rounded-full transition-all"
          style={{ width: `${percentage}%` }}
        />
      </div>
      <span className="text-xs text-muted-foreground w-12 text-right">{count}</span>
    </div>
  );
};

export function AirlineReviews({
  airlineCode,
  airlineName,
  userId,
  bookingId,
  maxDisplay = 5,
  showWriteReview = true,
  className,
}: AirlineReviewsProps) {
  const { toast } = useToast();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [stats, setStats] = useState<AirlineStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [canReview, setCanReview] = useState(false);
  const [expandedReviews, setExpandedReviews] = useState<Set<string>>(new Set());
  const [filterRating, setFilterRating] = useState<number | null>(null);

  const [formData, setFormData] = useState({
    rating: 0,
    title: '',
    content: '',
    pros: [''],
    cons: [''],
  });

  const fetchReviews = useCallback(async () => {
    setIsLoading(true);
    try {
      const url = `/api/v1/reviews?airlineCode=${airlineCode}${filterRating ? `&rating=${filterRating}` : ''}`;
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error('Failed to fetch reviews');
      }

      const result = await response.json();
      setReviews(result.data || []);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to load reviews. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [airlineCode, filterRating, toast]);

  const fetchStats = useCallback(async () => {
    try {
      const response = await fetch(`/api/v1/reviews/airline/${airlineCode}/stats`);

      if (!response.ok) {
        throw new Error('Failed to fetch stats');
      }

      const result = await response.json();
      setStats(result.data);
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    }
  }, [airlineCode]);

  const checkCanReview = useCallback(async () => {
    if (!userId || !bookingId) return;

    try {
      const response = await fetch(
        `/api/v1/reviews/airline/${airlineCode}/can-review?bookingId=${bookingId}`,
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('token')}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error('Failed to check review eligibility');
      }

      const result = await response.json();
      setCanReview(result.data.canReview);
    } catch (error) {
      console.error('Failed to check review eligibility:', error);
    }
  }, [airlineCode, userId, bookingId]);

  useEffect(() => {
    fetchReviews();
    fetchStats();
    if (userId && bookingId) {
      checkCanReview();
    }
  }, [fetchReviews, fetchStats, userId, bookingId, checkCanReview]);

  const handleSubmitReview = async () => {
    if (!formData.rating || formData.rating < 1) {
      toast({
        title: 'Rating required',
        description: 'Please select a star rating.',
        variant: 'destructive',
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch('/api/v1/reviews', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({
          airlineCode,
          bookingId,
          rating: formData.rating,
          title: formData.title || undefined,
          content: formData.content || undefined,
          pros: formData.pros.filter((p) => p.trim()),
          cons: formData.cons.filter((c) => c.trim()),
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Failed to submit review');
      }

      const result = await response.json();

      toast({
        title: 'Review submitted!',
        description: 'Thank you for your feedback.',
      });

      setIsDialogOpen(false);
      setFormData({
        rating: 0,
        title: '',
        content: '',
        pros: [''],
        cons: [''],
      });
      setCanReview(false);
      fetchReviews();
      fetchStats();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to submit review',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleExpand = (id: string) => {
    setExpandedReviews((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const getInitials = (address: string) => {
    return address.slice(0, 4) + '...' + address.slice(-4);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const displayedReviews = filterRating
    ? reviews.filter((r) => r.rating === filterRating)
    : reviews;

  const sortedReviews = [...displayedReviews].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  const topReviews = sortedReviews.slice(0, maxDisplay);

  return (
    <div className={cn('space-y-6', className)}>
      {/* Stats Card */}
      {stats && stats.totalReviews > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="font-serif flex items-center justify-between">
              <span>
                {airlineName || airlineCode} Reviews
              </span>
              <Badge variant="secondary" className="text-sm">
                {stats.totalReviews} {stats.totalReviews === 1 ? 'review' : 'reviews'}
              </Badge>
            </CardTitle>
            <CardDescription>
              Average rating from verified travelers
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row gap-6">
              <div className="flex flex-col items-center justify-center sm:w-32">
                <div className="text-4xl font-bold text-foreground">
                  {stats.averageRating.toFixed(1)}
                </div>
                <StarRating rating={stats.averageRating} size="lg" readonly />
                <div className="text-sm text-muted-foreground mt-1">
                  {stats.totalReviews} reviews
                </div>
              </div>

              <div className="flex-1 space-y-1">
                {[5, 4, 3, 2, 1].map((rating) => (
                  <RatingDistributionBar
                    key={rating}
                    rating={rating}
                    count={stats.ratingDistribution[rating] || 0}
                    total={stats.totalReviews}
                  />
                ))}
              </div>
            </div>

            <Separator className="my-4" />

            <div className="flex gap-4 text-sm text-muted-foreground">
              <div className="flex items-center gap-1">
                <CheckCircle className="h-4 w-4 text-green-500" />
                <span>{stats.verifiedReviews} verified</span>
              </div>
              <div className="flex items-center gap-1">
                <User className="h-4 w-4" />
                <span>{stats.unverifiedReviews} unverified</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Write Review Button */}
      {showWriteReview && canReview && (
        <Button onClick={() => setIsDialogOpen(true)} className="w-full sm:w-auto">
          Write a Review
        </Button>
      )}

      {/* Review List */}
      <div className="space-y-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : topReviews.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="p-12 text-center">
              <Star className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-2">No Reviews Yet</h3>
              <p className="text-muted-foreground max-w-md mx-auto">
                {canReview
                  ? 'Be the first to review this airline!'
                  : 'Reviews will appear here once travelers share their experiences.'}
              </p>
            </CardContent>
          </Card>
        ) : (
          topReviews.map((review) => {
            const isExpanded = expandedReviews.has(review.id);
            const shouldTruncate = review.content && review.content.length > 200;

            return (
              <Card key={review.id} className="overflow-hidden">
                <CardContent className="p-6">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                    <div className="space-y-2 flex-1">
                      <div className="flex items-center gap-3">
                        <StarRating rating={review.rating} size="sm" readonly />
                        {review.isVerified && (
                          <Badge variant="secondary" className="text-xs">
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Verified
                          </Badge>
                        )}
                      </div>

                      {review.title && (
                        <h4 className="font-semibold text-foreground">{review.title}</h4>
                      )}

                      <p className="text-sm text-muted-foreground">
                        {shouldTruncate && !isExpanded
                          ? `${review.content?.slice(0, 200)}...`
                          : review.content}
                      </p>

                      {shouldTruncate && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleExpand(review.id)}
                          className="text-primary hover:text-primary/80 px-0"
                        >
                          {isExpanded ? 'Show less' : 'Show more'}
                        </Button>
                      )}

                      {review.pros && review.pros.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {review.pros.slice(0, 3).map((pro, i) => (
                            <Badge key={i} variant="outline" className="text-xs bg-green-50">
                              <ThumbsUp className="h-3 w-3 mr-1 text-green-500" />
                              {pro}
                            </Badge>
                          ))}
                          {review.pros.length > 3 && (
                            <Badge variant="outline" className="text-xs">
                              +{review.pros.length - 3} more
                            </Badge>
                          )}
                        </div>
                      )}

                      {review.cons && review.cons.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {review.cons.slice(0, 3).map((con, i) => (
                            <Badge key={i} variant="outline" className="text-xs bg-red-50">
                              <ThumbsDown className="h-3 w-3 mr-1 text-red-500" />
                              {con}
                            </Badge>
                          ))}
                          {review.cons.length > 3 && (
                            <Badge variant="outline" className="text-xs">
                              +{review.cons.length - 3} more
                            </Badge>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col items-end gap-1 text-sm text-muted-foreground flex-shrink-0">
                      <div className="flex items-center gap-1">
                        <User className="h-3 w-3" />
                        <span>{getInitials(review.user.walletAddress)}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        <span>{formatDate(review.createdAt)}</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}

        {sortedReviews.length > maxDisplay && (
          <div className="text-center">
            <Button variant="outline" className="mt-2">
              Load More Reviews
            </Button>
          </div>
        )}
      </div>

      {/* Review Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-serif">Write a Review</DialogTitle>
            <DialogDescription>
              Share your experience with {airlineName || airlineCode}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm font-medium mb-1 block">Rating *</label>
              <StarRating
                rating={formData.rating}
                onRatingChange={(rating) => setFormData({ ...formData, rating })}
                size="lg"
              />
            </div>

            <div>
              <label className="text-sm font-medium mb-1 block">Title</label>
              <Input
                placeholder="Summarize your experience"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              />
            </div>

            <div>
              <label className="text-sm font-medium mb-1 block">Review *</label>
              <Textarea
                placeholder="Share your experience with this airline..."
                value={formData.content}
                onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                rows={4}
              />
            </div>

            <div>
              <label className="text-sm font-medium mb-1 block">What went well?</label>
              {formData.pros.map((pro, index) => (
                <div key={index} className="flex gap-2 mb-2">
                  <Input
                    placeholder={`Pro ${index + 1}`}
                    value={pro}
                    onChange={(e) => {
                      const newPros = [...formData.pros];
                      newPros[index] = e.target.value;
                      setFormData({ ...formData, pros: newPros });
                    }}
                  />
                  {formData.pros.length > 1 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        const newPros = formData.pros.filter((_, i) => i !== index);
                        setFormData({ ...formData, pros: newPros });
                      }}
                    >
                      ×
                    </Button>
                  )}
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setFormData({ ...formData, pros: [...formData.pros, ''] })}
              >
                + Add pro
              </Button>
            </div>

            <div>
              <label className="text-sm font-medium mb-1 block">What could be improved?</label>
              {formData.cons.map((con, index) => (
                <div key={index} className="flex gap-2 mb-2">
                  <Input
                    placeholder={`Con ${index + 1}`}
                    value={con}
                    onChange={(e) => {
                      const newCons = [...formData.cons];
                      newCons[index] = e.target.value;
                      setFormData({ ...formData, cons: newCons });
                    }}
                  />
                  {formData.cons.length > 1 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        const newCons = formData.cons.filter((_, i) => i !== index);
                        setFormData({ ...formData, cons: newCons });
                      }}
                    >
                      ×
                    </Button>
                  )}
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setFormData({ ...formData, cons: [...formData.cons, ''] })}
              >
                + Add con
              </Button>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmitReview} disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Submit Review
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}